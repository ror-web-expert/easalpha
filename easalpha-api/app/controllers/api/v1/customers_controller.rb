require "csv"

module Api
  module V1
    class CustomersController < BaseController
      before_action -> { require_permission!("customers.view", "customers.manage", "orders.create") }, only: %i[index show lookup orders]
      before_action -> { require_permission!("customers.manage") }, except: %i[index show lookup orders]
      before_action :read_only_guard!, except: %i[index show lookup orders]

      # GET /customers?q=&status=&group_id=&with_balance=true
      def index
        scope = Customer.active.includes(:group).order(:name)
        scope = Customer.lookup(params[:q]).includes(:group).order(:name) if params[:q].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(group_id: params[:group_id]) if params[:group_id].present?
        scope = scope.where("balance_minor > 0") if params[:with_balance] == "true"
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |c| CustomerSerializers.customer(c) }
      end

      # GET /customers/insights?sort=spent|orders|balance|recent|name&from&to  (SPEC Customer Insights)
      def insights
        from = params[:from].present? ? Date.parse(params[:from]) : today - 90
        to = params[:to].present? ? Date.parse(params[:to]) : today
        customers = Customer.active.where(is_walk_in: false).to_a
        ids = customers.map(&:id)
        orders = Order.where(customer_id: ids, business_day: from..to, status: %w[paid closed refunded])
        spent = orders.group(:customer_id).sum(:total_minor)
        counts = orders.group(:customer_id).count
        last = Order.where(customer_id: ids, status: %w[paid closed refunded]).group(:customer_id).maximum(:business_day)
        paid = CustomerPayment.where(customer_id: ids, direction: "received", business_day: from..to).group(:customer_id).sum(:amount_minor)
        rows = customers.map do |c|
          { customer: CustomerSerializers.customer(c), spent_minor: spent[c.id] || 0, orders: counts[c.id] || 0, average_minor: (counts[c.id] || 0).zero? ? 0 : spent[c.id] / counts[c.id], paid_on_account_minor: paid[c.id] || 0,
            balance_minor: c.balance_minor, loyalty_points: c.loyalty_points, last_order_on: last[c.id] }
        end
        rows = case params[:sort].to_s
        when "orders" then rows.sort_by { |r| -r[:orders] }
        when "balance" then rows.sort_by { |r| -r[:balance_minor] }
        when "recent" then rows.sort_by { |r| r[:last_order_on] ? -r[:last_order_on].jd : 0 }
        when "name" then rows.sort_by { |r| r[:customer][:name].downcase }
        else rows.sort_by { |r| -r[:spent_minor] }
        end
        render json: { from: from, to: to, sort: params[:sort].presence || "spent", rows: rows.first((params[:limit].presence || 200).to_i),
                       totals: { customers: rows.size, spent_minor: rows.sum { |r| r[:spent_minor] }, orders: rows.sum { |r| r[:orders] }, balance_minor: rows.sum { |r| r[:balance_minor] }, with_balance: rows.count { |r| r[:balance_minor].positive? },
                                 by_status: Customer.active.group(:status).count, by_source: Customer.active.group(:source).count } }
      end

      # POST /customers/:id/send_statement  (SPEC Customer Account: SEND_ACCOUNT_BILL)
      def send_statement
        require_permission!("SEND_ACCOUNT_BILL", "CUSTOMER_ACCOUNT", "customers.manage")
        c = Customer.active.find(params[:id])
        msg = Whatsapp::Account.send_statement!(c, actor: current_membership)
        render json: { message_id: msg&.id, status: msg&.status, to: c.phone }, status: :created
      end

      # GET /customers/lookup?phone=  exact match by phone with the last order, for one-tap repeat on the till
      def lookup
        phone = User.normalize_phone(params[:phone])
        customer = phone && Customer.active.find_by(phone: phone)
        return render json: { found: false, phone: phone } unless customer
        last = Order.where(customer_id: customer.id).where.not(status: "voided").includes(items: :modifiers).order(created_at: :desc).first
        render json: { found: true, customer: CustomerSerializers.customer(customer, full: true), last_order: last && OrderSerializers.full(last) }
      end

      def show
        render json: CustomerSerializers.customer(Customer.includes(:group, :addresses).find(params[:id]), full: true)
      end

      def orders
        customer = Customer.find(params[:id])
        rows, cursor = paginate(Order.where(customer_id: customer.id).includes(:dining_table, :items))
        render_page(rows, cursor) { |o| OrderSerializers.summary(o) }
      end

      def create
        c = Customer.create!(customer_params.merge(source: params[:source].presence || "in_store"))
        create_addresses!(c)
        audit!("create", record: c, after: { name: c.name, phone: c.phone })
        render json: CustomerSerializers.customer(c.reload, full: true), status: :created
      rescue ActiveRecord::RecordInvalid => e
        raise Api::Errors::Conflict.new("customer.phone_exists", "A customer with this phone already exists") if e.record.errors[:phone].any? { |m| m.include?("taken") }
        raise
      end

      def update
        c = Customer.find(params[:id])
        raise Api::Errors::Conflict.new("customer.walk_in", "The walk-in customer cannot be edited") if c.is_walk_in && params.keys.intersect?(%w[name phone is_walk_in])
        before = CustomerSerializers.customer(c)
        c.update!(customer_params)
        create_addresses!(c)
        audit!("update", record: c, before: before, after: CustomerSerializers.customer(c))
        render json: CustomerSerializers.customer(c.reload, full: true)
      end

      def destroy
        c = Customer.find(params[:id])
        raise Api::Errors::Conflict.new("customer.walk_in", "The walk-in customer cannot be archived") if c.is_walk_in
        raise Api::Errors::Conflict.new("customer.has_balance", "Settle the balance of Rs #{c.balance_minor / 100} first") if c.balance_minor != 0
        c.update!(archived_at: Time.current, status: "deactivated")
        head :no_content
      end

      def approve
        c = Customer.find(params[:id])
        c.update!(status: "active")
        render json: CustomerSerializers.customer(c)
      end

      def add_address
        c = Customer.find(params[:id])
        a = c.addresses.create!(address_params)
        render json: CustomerSerializers.address(a), status: :created
      end

      def remove_address
        c = Customer.find(params[:id])
        c.addresses.find(params[:address_id]).destroy!
        head :no_content
      end

      # POST /customers/import  data: CSV with name, phone, email, company, group, address, notes, khata_no?
      def import
        created = updated = 0
        errors = []
        CSV.parse(params.require(:data).to_s, headers: true, header_converters: ->(h) { h.to_s.strip.downcase.tr(" ", "_") }).each_with_index do |row, i|
          name = row["name"].to_s.strip
          phone = User.normalize_phone(row["phone"])
          if name.blank?
            errors << { line: i + 2, error: "name is missing" }
            next
          end
          group = row["group"].present? ? (CustomerGroup.active.find_by(name: row["group"]) || CustomerGroup.create!(name: row["group"])) : nil
          existing = phone && Customer.active.find_by(phone: phone)
          attrs = { name: name, phone: phone, email: row["email"].presence, company: row["company"].presence, group: group, notes: row["notes"].presence }.compact
          if existing
            existing.update!(attrs)
            updated += 1
          else
            c = Customer.create!(attrs.merge(source: "import"))
            c.addresses.create!(line1: row["address"], is_default: true) if row["address"].present?
            created += 1
          end
        rescue ActiveRecord::RecordInvalid => e
          errors << { line: i + 2, error: e.record.errors.full_messages.to_sentence }
        end
        audit!("create", table_name: "customers", after: { import: { created: created, updated: updated, errors: errors.size } }) if created.positive? || updated.positive?
        render json: { created: created, updated: updated, error_rows: errors }
      end

      private

      def customer_params
        params.permit(:name, :phone, :email, :company, :group_id, :status, :credit_limit_minor, :birthday, :whatsapp_opt_in, :notes).tap do |p|
          if p.key?(:whatsapp_opt_in)
            on = ActiveModel::Type::Boolean.new.cast(p[:whatsapp_opt_in])
            p[:opt_in_at] = on ? Time.current : nil
            p[:opt_in_source] = on ? "staff" : nil
            p[:opted_out_at] = on ? nil : Time.current
          end
        end
      end

      def address_params = params.permit(:label, :line1, :line2, :area, :city, :lat, :lng, :is_default)

      def create_addresses!(customer)
        return unless params[:addresses].is_a?(Array)
        params[:addresses].each { |a| customer.addresses.create!(a.permit(:label, :line1, :line2, :area, :city, :lat, :lng, :is_default)) }
      end
    end
  end
end
