module Api
  module V1
    module Super
      class BusinessesController < BaseController
        before_action :authenticate_super!

        def index
          scope = Business.includes(:plan).order(created_at: :desc)
          scope = scope.where(status: params[:status]) if params[:status].present?
          scope = scope.where("name ILIKE ? OR slug ILIKE ?", "%#{params[:q]}%", "%#{params[:q]}%") if params[:q].present?
          rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
          render_page(rows, cursor) { |b| Serializers.business(b).merge(members: Membership.unscoped.where(business_id: b.id, status: "active").count) }
        end

        def show
          b = Business.find(params[:id])
          Tenancy::Context.with(b) do
            render json: Serializers.business(b).merge(branches: Branch.all.map { |br| Serializers.branch(br) }, devices: Device.count, staff: Membership.active.count)
          end
        end

        def update
          b = Business.find(params[:id])
          b.update!(params.permit(:status, :trial_ends_on, :plan_id))
          AuditLog.record(action: "settings_change", record: b, after: params.permit(:status, :trial_ends_on, :plan_id).to_h, business: b)
          render json: Serializers.business(b)
        end

        def stats
          render json: {
            businesses: Business.group(:status).count,
            signups_last_30_days: Business.where("created_at > ?", 30.days.ago).count,
            plans: Business.joins(:plan).group("plans.code").count
          }
        end
      end
    end
  end
end
