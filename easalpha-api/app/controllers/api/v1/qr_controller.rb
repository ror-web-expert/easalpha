module Api
  module V1
    # Public, unauthenticated QR table ordering. The table token identifies the business; nothing else is exposed.
    class QrController < ActionController::API
      include ActionController::MimeResponds
      rescue_from Api::Errors::ApiError do |e|
        loc = request.headers["Accept-Language"].to_s.downcase.start_with?("ur") ? :ur : :en
        render json: { error: { code: e.code, message: loc == :ur ? I18n.t("errors", locale: :ur, default: {}).fetch(e.code.to_s.to_sym, e.message) : e.message, details: e.details } }, status: e.status
      end
      rescue_from ActiveRecord::RecordNotFound do |e|
        render json: { error: { code: "not_found", message: "Not found" } }, status: :not_found
      end
      rescue_from ActiveRecord::RecordInvalid do |e|
        render json: { error: { code: "validation_failed", message: e.record.errors.full_messages.to_sentence } }, status: :unprocessable_content
      end
      around_action :scope_to_table

      # GET /qr/:token
      def show = render(json: Qr::Ordering.menu(@table))

      # GET /qr/:token/bill
      def bill
        b = Qr::Ordering.bill(@table)
        render json: b || { order_id: nil, items: [], total_minor: 0 }
      end

      # POST /qr/:token/orders { guest_name, notes, client_id, lines: [{product_id, variant_id, quantity, modifiers: [{modifier_id, quantity}], notes}] }
      def create_order
        lines = Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
        order = Qr::Ordering.place!(@table, lines: lines, guest_name: params[:guest_name], notes: params[:notes], client_id: params[:client_id])
        render json: guest_order(order), status: :created
      end

      # GET /qr/:token/orders/:id?guest_token=
      def order
        order = Order.find_by!(id: params[:id], table_id: @table.id)
        raise Api::Errors::NotFound.new("qr.order", "Not found") unless order.qr_guest_token.present? && order.qr_guest_token == params[:guest_token]
        render json: guest_order(order)
      end

      # POST /qr/:token/requests { kind: call_waiter|ask_bill, guest_name, note }
      def create_request
        r = Qr::Ordering.request!(@table, kind: params.require(:kind), guest_name: params[:guest_name], note: params[:note])
        render json: { id: r.id, kind: r.kind, requested_at: r.requested_at, handled: r.handled_at.present? }, status: :created
      end

      private

      def scope_to_table
        table = Tenancy::Context.unscoped { DiningTable.includes(branch: :business).find_by(qr_token: params[:token], archived_at: nil) }
        raise Api::Errors::NotFound.new("qr.unknown", "This table card is not valid") unless table
        Tenancy::Context.with(table.branch.business, branch: table.branch) do
          @table = DiningTable.find(table.id)
          yield
        end
      end

      def guest_order(order)
        { id: order.id, guest_token: order.qr_guest_token, label: order.label, status: order.status, qr_status: order.qr_status, guest_name: order.guest_name, table_code: @table.code,
          items: order.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F"), line_subtotal_minor: i.line_subtotal_minor, line_total_minor: i.line_total_minor, status: i.status } },
          subtotal_minor: order.subtotal_minor, discount_minor: order.discount_minor, tax_minor: order.tax_minor, tax_inclusive_minor: Receipts::Builder.inclusive_tax_minor(order), service_charge_minor: order.service_charge_minor, rounding_minor: order.rounding_minor, total_minor: order.total_minor,
          message: order.qr_status == "pending" ? "Waiting for the cashier to accept your order" : (order.qr_status == "rejected" ? "Sorry, the cashier could not accept this order" : "Your order is with the kitchen") }
      end
    end
  end
end
