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
