module Api
  module V1
    module Super
      class FeatureFlagsController < BaseController
        before_action :authenticate_super!

        def index
          render json: { data: FeatureFlag.order(:key, :business_id).map { |f| { id: f.id, key: f.key, business_id: f.business_id, enabled: f.enabled } } }
        end

        # PUT /super/feature_flags  key, enabled, business_id (null = global)
        def upsert
          f = FeatureFlag.find_or_initialize_by(key: params.require(:key), business_id: params[:business_id].presence)
          f.update!(enabled: ActiveModel::Type::Boolean.new.cast(params[:enabled]))
          render json: { id: f.id, key: f.key, business_id: f.business_id, enabled: f.enabled }
        end

        def health
          render json: { status: "ok", time: Time.current, version: Servio::VERSION,
                         database: ActiveRecord::Base.connection.active?, pending_jobs: (SolidQueue::Job.where(finished_at: nil).count rescue nil),
                         businesses: Business.where.not(status: "deleted").count, orders_today: Order.unscoped.where(business_day: Date.current).count,
                         tax_failed: TaxInvoice.unscoped.where(status: "failed").count, whatsapp_failed_24h: WhatsappMessage.where(status: "failed").where("created_at > ?", 24.hours.ago).count }
        end
      end
    end
  end
end
