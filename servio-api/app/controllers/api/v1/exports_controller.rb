require "csv"

module Api
  module V1
    # Owners can take all their data out as CSV at any time: menu, orders, customers, payments, stock later.
    class ExportsController < BaseController
      before_action -> { require_permission!("settings.manage", "reports.view_all", "billing.manage") }

      KINDS = %w[menu orders order_items customers payments staff audit_logs stock_items stock_ledger stock_documents suppliers purchases supplier_payments].freeze

      def index
        render json: { kinds: KINDS, note: "GET /exports/:kind.csv?from=YYYY-MM-DD&to=YYYY-MM-DD for orders, order_items, payments and audit_logs" }
      end

      def show
        kind = params[:kind].to_s
        raise Api::Errors::NotFound.new("export.kind", "Unknown export #{kind}") unless KINDS.include?(kind)
        audit!("export", table_name: kind, after: { from: params[:from], to: params[:to] })
        send_data send(:"csv_#{kind}"), filename: "servio-#{current_business.slug}-#{kind}-#{Date.current}.csv", type: "text/csv"
      end

      private

      def range
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current - 30
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        from..to
      end

      def csv(headers)
        CSV.generate { |csv| csv << headers; yield csv }
      end

      def csv_menu
        csv(%w[menu category product sku price description active show_online tax_rate]) do |out|
          Product.where(archived_at: nil).includes(category: :menu).includes(:tax_rate).find_each do |p|
            out << [ p.category.menu.name, p.category.name, p.name, p.sku, p.base_price_minor / 100.0, p.description, p.active, p.show_online, p.tax_rate&.name ]
          end
        end
      end

      def csv_orders
        csv(%w[business_day serial type source status payment_status customer table subtotal discount service_charge tax total paid placed_at paid_at voided_reason]) do |out|
          Order.where(branch_id: current_branch.id, business_day: range).includes(:customer, :dining_table).find_each do |o|
            out << [ o.business_day, o.serial, o.order_type, o.source, o.status, o.payment_status, o.customer&.name, o.dining_table&.code, o.subtotal_minor / 100.0, o.discount_minor / 100.0,
                    o.service_charge_minor / 100.0, o.tax_minor / 100.0, o.total_minor / 100.0, o.paid_minor / 100.0, o.placed_at, o.paid_at, o.void_reason ]
          end
        end
      end

      def csv_order_items
        csv(%w[business_day serial item quantity unit_price modifiers line_total status]) do |out|
          OrderItem.joins(:order).where(orders: { branch_id: current_branch.id, business_day: range }).includes(:order, :modifiers).find_each do |i|
            out << [ i.order.business_day, i.order.serial, i.name_snapshot, i.quantity, i.unit_price_minor / 100.0, i.modifiers.map(&:name_snapshot).join("; "), i.line_total_minor / 100.0, i.status ]
          end
        end
      end

      def csv_customers
        csv(%w[khata_no name phone email company group balance orders net_spent last_order_at]) do |out|
          Customer.active.includes(:group).find_each { |c| out << [ c.khata_no, c.name, c.phone, c.email, c.company, c.group&.name, c.balance_minor / 100.0, c.orders_count, c.net_spent_minor / 100.0, c.last_order_at ] }
        end
      end

      def csv_payments
        csv(%w[business_day serial method amount tendered change reference received_at]) do |out|
          Payment.where(branch_id: current_branch.id, business_day: range, status: "captured").includes(:order).find_each do |p|
            out << [ p.business_day, p.order.serial, p.method_code, p.amount_minor / 100.0, p.tendered_minor && p.tendered_minor / 100.0, p.change_minor / 100.0, p.reference, p.received_at ]
          end
        end
      end

      def csv_stock_items
        csv(%w[name sku category base_unit purchase_unit minimum reorder avg_cost quantity value]) do |out|
          StockItem.active.includes(:base_unit, :purchase_unit, :stock_levels).order(:name).each do |i|
            out << [ i.name, i.sku, i.category, i.base_unit.code, i.purchase_unit&.code, i.minimum_qty, i.reorder_qty, (i.avg_cost_minor_per_base / 100).round(4), i.total_quantity, i.total_value_minor / 100.0 ]
          end
        end
      end

      def csv_stock_ledger
        csv(%w[business_day occurred_at kind section item quantity before after unit_cost value reason ref_table ref_id]) do |out|
          StockLedgerEntry.where(branch_id: current_branch.id, business_day: range).includes(:stock_section, :stock_item).order(:occurred_at).find_each do |e|
            out << [ e.business_day, e.occurred_at, e.kind, e.stock_section.name, e.stock_item.name, e.quantity, e.before_qty, e.after_qty, (e.unit_cost_minor / 100).round(4), e.value_minor / 100.0, e.reason, e.ref_table, e.ref_id ]
          end
        end
      end

      def csv_stock_documents
        csv(%w[number kind status business_day from_section to_section reason invoice_ref lines posted_at]) do |out|
          StockDocument.where(branch_id: current_branch.id).includes(:from_section, :to_section, :lines).order(:number).find_each do |d|
            out << [ d.label, d.kind, d.status, d.business_day, d.from_section&.name, d.to_section&.name, d.reason, d.invoice_ref, d.lines.size, d.posted_at ]
          end
        end
      end

      def csv_suppliers
        csv(%w[name contact phone email terms_days balance]) do |out|
          Supplier.active.order(:name).each { |s| out << [ s.name, s.contact_name, s.phone, s.email, s.payment_terms_days, s.balance_minor / 100.0 ] }
        end
      end

      def csv_purchases
        csv(%w[receipt received_on supplier invoice item quantity unit unit_cost line_total]) do |out|
          GoodsReceiptLine.joins(:goods_receipt).where(goods_receipts: { branch_id: current_branch.id, status: "posted", received_on: range }).includes(:stock_item, :unit, goods_receipt: :supplier).find_each do |l|
            out << [ l.goods_receipt.label, l.goods_receipt.received_on, l.goods_receipt.supplier.name, l.goods_receipt.invoice_ref, l.stock_item.name, l.quantity, l.unit.code, l.unit_cost_minor / 100.0, l.line_total_minor / 100.0 ]
          end
        end
      end

      def csv_supplier_payments
        csv(%w[number supplier direction amount method reference paid_on]) do |out|
          SupplierPayment.where(paid_on: range).includes(:supplier, :payment_method).order(:paid_on).find_each { |p| out << [ p.label, p.supplier.name, p.direction, p.amount_minor / 100.0, p.payment_method&.code, p.reference, p.paid_on ] }
        end
      end

      def csv_staff
        csv(%w[name phone email role status created_at]) do |out|
          Membership.includes(:user, :role).find_each { |m| out << [ m.user.name, m.user.phone, m.user.email, m.role.name, m.status, m.created_at ] }
        end
      end

      def csv_audit_logs
        csv(%w[occurred_at action table record_id user_id device_id approved_by after]) do |out|
          AuditLog.where(business_id: current_business.id, occurred_at: range.begin.beginning_of_day..range.end.end_of_day).find_each do |a|
            out << [ a.occurred_at, a.action, a.table_name, a.record_id, a.user_id, a.device_id, a.approved_by_user_id, a.after&.to_json ]
          end
        end
      end
    end
  end
end
