require "csv"

module Api
  module V1
    class SuppliersController < BaseController
      before_action :authenticate!
      READS = %i[index show ledger aging insights payments aging_report summary ranking adjustments all_payments].freeze
      # SPEC Suppliers permissions: SUPPLIERS, SUPPLIER_LEDGER, SUPPLIER_VIEW_LEDGER, Record Supplier Payment; PO_ADD_SUPPLIER creates inline.
      before_action -> { require_permission!("SUPPLIERS", "PURCHASE_ORDERS", "stock.view", "finance.view") }, only: %i[index show summary ranking]
      before_action -> { require_permission!("SUPPLIER_LEDGER", "SUPPLIER_VIEW_LEDGER", "SUPPLIER_RECORD_PAYMENT", "finance.view") }, only: %i[ledger aging insights payments aging_report adjustments all_payments]
      before_action -> { require_permission!("SUPPLIER_RECORD_PAYMENT", "PO_PAYMENT") }, only: :pay
      before_action -> { require_permission!("SUPPLIER_LEDGER") }, only: :adjust
      before_action -> { require_permission!("SUPPLIERS", "PO_ADD_SUPPLIER") }, only: :create
      before_action -> { require_permission!("SUPPLIERS") }, only: %i[update destroy import]
      before_action :read_only_guard!, except: READS

      # GET /suppliers?q=&with_balance=true
      def index
        scope = Supplier.active.order(:name)
        scope = scope.where("name ILIKE :q OR phone ILIKE :q OR contact_name ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?
        scope = scope.where("balance_minor <> 0") if params[:with_balance] == "true"
        rows, cursor = paginate(scope)
        counts = SupplierSerializers.supplier_counts(rows.map(&:id))
        render_page(rows, cursor) { |s| SupplierSerializers.supplier(s, counts: counts) }
      end

      def show = render(json: SupplierSerializers.supplier(Supplier.find(params[:id])))

      # GET /suppliers/ranking?sort=purchased|paid|outstanding|name&from=&to=  (SPEC Supplier Insights)
      def ranking
        from = params[:from].present? ? Date.parse(params[:from]) : nil
        to = params[:to].present? ? Date.parse(params[:to]) : nil
        render json: Suppliers::Ledger.ranking(sort: params[:sort].presence || "purchased", from: from, to: to)
      end

      # GET /suppliers/:id/adjustments   POST /suppliers/:id/adjust { amount_minor (signed), reason }
      def adjustments
        s = Supplier.find(params[:id])
        render json: { data: SupplierAdjustment.where(supplier_id: s.id).order(created_at: :desc).map { |a| SupplierSerializers.adjustment(a) } }
      end

      def adjust
        s = Supplier.active.find(params[:id])
        adj = Suppliers::Ledger.adjust!(s, amount_minor: params.require(:amount_minor).to_i, reason: params[:reason].to_s, actor: current_membership, branch: current_branch)
        render json: { adjustment: SupplierSerializers.adjustment(adj), supplier: SupplierSerializers.supplier(s.reload) }, status: :created
      end

      def create
        s = Supplier.create!(supplier_params)
        audit!("create", record: s, after: { name: s.name })
        render json: SupplierSerializers.supplier(s), status: :created
      end

      def update
        s = Supplier.active.find(params[:id])
        s.update!(supplier_params.except(:opening_balance_minor))
        render json: SupplierSerializers.supplier(s)
      end

      def destroy
        s = Supplier.active.find(params[:id])
        raise Api::Errors::Conflict.new("supplier.has_balance", "Settle the balance of #{s.name} before archiving") unless s.balance_minor.zero?
        s.update!(archived_at: Time.current, active: false)
        head :no_content
      end

      def ledger
        s = Supplier.find(params[:id])
        entries = Suppliers::Ledger.entries(s)
        render json: { supplier: SupplierSerializers.supplier(s), tiles: Suppliers::Ledger.tiles(s, entries), entries: entries, aging: Suppliers::Ledger.aging(s) }
      end

      def aging = render(json: Suppliers::Ledger.aging(Supplier.find(params[:id]), as_of: params[:as_of].present? ? Date.parse(params[:as_of]) : Date.current))
      def aging_report = render(json: Suppliers::Ledger.aging_report(as_of: params[:as_of].present? ? Date.parse(params[:as_of]) : Date.current))
      def summary = render(json: Suppliers::Ledger.summary)

      def insights
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current - 90
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        render json: Suppliers::Ledger.insights(Supplier.find(params[:id]), from: from, to: to)
      end

      # GET /supplier_payments?supplier_id=&from=&to=&method_code=&direction=  (SPEC Supplier Payments screen)
      def all_payments
        scope = SupplierPayment.includes(:payment_method, :supplier, :purchase_order).order(paid_on: :desc, created_at: :desc)
        scope = scope.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?
        scope = scope.where(direction: params[:direction]) if params[:direction].present?
        scope = scope.where(paid_on: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(paid_on: ..Date.parse(params[:to])) if params[:to].present?
        scope = scope.where(payment_method_id: PaymentMethod.where(code: params[:method_code]).select(:id)) if params[:method_code].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
        totals = { paid_minor: scope.where(direction: "paid").sum(:amount_minor), received_minor: scope.where(direction: "received").sum(:amount_minor), count: scope.count }
        render json: { data: rows.map { |p| SupplierSerializers.payment(p).merge(supplier_name: p.supplier.name) }, next_cursor: cursor, totals: totals }
      end

      # GET /suppliers/:id/payments   POST /suppliers/:id/payments { amount_minor, method_code, reference, direction, goods_receipt_id, note }
      def payments
        s = Supplier.find(params[:id])
        rows, cursor = Paginator.call(SupplierPayment.where(supplier_id: s.id).includes(:payment_method), cursor: params[:cursor], limit: params[:limit])
        render_page(rows, cursor) { |p| SupplierSerializers.payment(p) }
      end

      def pay
        s = Supplier.active.find(params[:id])
        sp = Purchasing::Payments.record!(s, amount_minor: params.require(:amount_minor).to_i, method_code: params.require(:method_code), actor: current_membership, branch: current_branch, shift: current_shift,
                                          reference: params[:reference], note: params[:note], goods_receipt_id: params[:goods_receipt_id].presence, purchase_order_id: params[:purchase_order_id].presence,
                                          direction: params[:direction].presence_in(%w[paid received]) || "paid",
                                          paid_on: params[:paid_on].present? ? Date.parse(params[:paid_on]) : nil)
        render json: { payment: SupplierSerializers.payment(sp), supplier: SupplierSerializers.supplier(s.reload) }, status: :created
      end

      # POST /suppliers/import { csv }  columns: name, contact, phone, email, address, terms, opening_balance
      def import
        created = updated = 0
        CSV.parse(params.require(:csv).to_s, headers: true, header_converters: ->(h) { h.to_s.strip.downcase.tr(" ", "_") }).each do |r|
          name = r["name"].to_s.strip
          next if name.blank?
          attrs = { contact_name: r["contact"] || r["contact_name"], phone: r["phone"], email: r["email"], address: r["address"], payment_terms_days: r["terms"].to_i }
          if (s = Supplier.active.find_by(name: name))
            s.update!(attrs.compact)
            updated += 1
          else
            Supplier.create!(attrs.merge(name: name, opening_balance_minor: (r["opening_balance"].to_d * 100).round))
            created += 1
          end
        end
        render json: { created: created, updated: updated }
      end

      private

      def supplier_params
        params.permit(:name, :contact_name, :phone, :email, :address, :ntn, :opening_balance_minor, :payment_terms_days, :notes, :active)
      end
    end
  end
end
