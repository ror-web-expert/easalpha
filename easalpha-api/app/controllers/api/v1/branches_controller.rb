module Api
  module V1
    class BranchesController < BaseController
      before_action :authenticate!

      def index
        render json: { data: Branch.active.order(:created_at).map { |b| view(b) } }
      end

      def show
        render json: view(Branch.find(params[:id]))
      end

      def create
        require_permission!("settings.manage")
        read_only_guard!
        limit = current_business.plan_limit("branches")
        raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} branch(es). Upgrade to add more.") if limit && Branch.active.count >= limit
        branch = Branch.new(branch_params.merge(is_main: Branch.active.none?))
        branch.time_zone = current_business.time_zone if params[:time_zone].blank? # the store's clock, not the column's Karachi default (S3)
        token = branch.apply_tax_registration(tax_params) if params.key?(:tax_registration)
        branch.save!
        audit!("create", record: branch, after: audit_view(branch, token))
        render json: view(branch), status: :created
      end

      def update
        require_permission!("settings.manage")
        read_only_guard!
        branch = Branch.find(params[:id])
        before = audit_view(branch)
        branch.assign_attributes(branch_params)
        token = branch.apply_tax_registration(tax_params) if params.key?(:tax_registration)
        branch.save!
        audit!("settings_change", record: branch, before: before, after: audit_view(branch, token))
        # The checklist's "opening hours and the day-end time" is the business-day window the Business Hours screen
        # saves; opening_hours has no screen of its own (S10).
        SetupChecklistItem.complete!("branch_hours") if params.key?(:business_day_start) || params.key?(:day_end_time) || branch.opening_hours.present?
        render json: view(branch)
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

      # Staff see the registration numbers only; whoever manages settings also sees whether a token is saved (S1).
      def view(branch) = Serializers.branch(branch, tax: current_membership.can?("settings.manage") ? :manage : :public)

      # The audit row says that the token was changed or removed, never what it is.
      def audit_view(branch, token = nil)
        h = Serializers.branch(branch, tax: :manage)
        token ? h.merge(tax_token: token.to_s) : h
      end

      def branch_params
        params.permit(:name, :code, :address, :city, :phone, :time_zone, :day_end_time, :business_day_start, opening_hours: {}, qr_settings: {})
      end

      def tax_params
        raw = params[:tax_registration]
        raw.respond_to?(:permit) ? raw.permit(*Branch::PUBLIC_TAX_KEYS, :token, :token_clear) : {}
      end
    end
  end
end
