module Api
  module V1
    class BranchesController < BaseController
      before_action :authenticate!

      def index
        render json: { data: Branch.active.order(:created_at).map { |b| Serializers.branch(b) } }
      end

      def show
        render json: Serializers.branch(Branch.find(params[:id]))
      end

      def create
        require_permission!("settings.manage")
        read_only_guard!
        limit = current_business.plan_limit("branches")
        raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} branch(es). Upgrade to add more.") if limit && Branch.active.count >= limit
        branch = Branch.create!(branch_params.merge(is_main: Branch.active.none?))
        audit!("create", record: branch, after: Serializers.branch(branch))
        render json: Serializers.branch(branch), status: :created
      end

      def update
        require_permission!("settings.manage")
        read_only_guard!
        branch = Branch.find(params[:id])
        before = Serializers.branch(branch)
        branch.update!(branch_params)
        audit!("settings_change", record: branch, before: before, after: Serializers.branch(branch))
        SetupChecklistItem.complete!("branch_hours") if branch.opening_hours.present?
        render json: Serializers.branch(branch)
      end

      def destroy
        require_permission!("settings.manage")
        branch = Branch.find(params[:id])
        raise Api::Errors::Conflict.new("branch.is_main", "The main branch cannot be archived") if branch.is_main
        branch.update!(archived_at: Time.current)
        audit!("update", record: branch, after: { archived_at: branch.archived_at })
        head :no_content
      end

      private

      def branch_params
        params.permit(:name, :code, :address, :city, :phone, :time_zone, :day_end_time, :business_day_start, tax_registration: {}, opening_hours: {}, qr_settings: {})
      end
    end
  end
end
