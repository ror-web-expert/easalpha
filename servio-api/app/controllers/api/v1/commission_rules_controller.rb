module Api
  module V1
    class CommissionRulesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage", "settings.manage", "reports.view_all") }, only: %i[index report]
      before_action -> { require_permission!("staff.manage", "settings.manage") }, except: %i[index report]

      def index = render(json: { data: CommissionRule.order(:applies_to, :name).map { |r| serialize(r) } })

      def create
        r = CommissionRule.create!(rule_params)
        render json: serialize(r), status: :created
      end

      def update
        r = CommissionRule.find(params[:id])
        r.update!(rule_params)
        render json: serialize(r)
      end

      def destroy
        CommissionRule.find(params[:id]).destroy!
        head :no_content
      end

      # GET /reports/commissions?from=&to=
      def report
        from = params[:from].present? ? Date.parse(params[:from]) : current_branch.business_day_for(Time.current)
        to = params[:to].present? ? Date.parse(params[:to]) : from
        render json: Reports::Commissions.run(branch: current_branch, from: from, to: to)
      end

      private

      def rule_params = params.permit(:name, :applies_to, :role_key, :membership_id, :basis, :value, :active)
      def serialize(r) = { id: r.id, name: r.name, applies_to: r.applies_to, role_key: r.role_key, membership_id: r.membership_id, basis: r.basis, value: r.value.to_f, active: r.active }
    end
  end
end
