module Api
  module V1
    class PaymentMethodsController < BaseController
      before_action :authenticate!, only: :index
      before_action -> { require_permission!("settings.manage") }, except: :index

      def index
        render json: { data: PaymentMethod.order(:sort_order).map { |m| PaymentSerializers.payment_method(m) } }
      end

      # GET /payment_methods/catalogue  the SPEC list of wallets and banks, with the ones already added marked
      def catalogue
        added = PaymentMethod.pluck(:catalogue_code, :code).flatten.compact
        render json: { data: PaymentMethod::CATALOGUE.map { |c| c.merge(added: added.include?(c[:code])) } }
      end

      # POST /payment_methods { catalogue_code } or { code, name, kind, ... }. Adding a method creates its account.
      def create
        attrs = params.permit(:code, :name, :kind, :payment_account_id, :active, :works_offline, :needs_reference, :sort_order, :catalogue_code).to_h.symbolize_keys
        if attrs[:catalogue_code].present?
          c = PaymentMethod::CATALOGUE.find { |x| x[:code] == attrs[:catalogue_code] } or raise Api::Errors::NotFound.new("payment_method.catalogue", "Unknown catalogue entry")
          attrs = { code: c[:code], name: c[:name], kind: c[:kind], needs_reference: true, sort_order: PaymentMethod.count }.merge(attrs.compact)
        end
        m = PaymentMethod.create!(attrs)
        m.ensure_account!
        bump_settings_version!
        SetupChecklistItem.complete!("payment_methods")
        render json: PaymentSerializers.payment_method(m), status: :created
      end

      def update
        m = PaymentMethod.find(params[:id])
        m.update!(params.permit(:name, :payment_account_id, :active, :works_offline, :needs_reference, :sort_order))
        bump_settings_version!
        SetupChecklistItem.complete!("payment_methods")
        render json: PaymentSerializers.payment_method(m)
      end

      private

      # SPEC: a new or changed method syncs to every active cashier on the next connection.
      def bump_settings_version!
        current_business.settings_version += 1
        current_business.save!
      end
    end
  end
end
