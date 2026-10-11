module Api
  module V1
    # SPEC Fixed Assets with straight-line depreciation.
    class FixedAssetsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("finance.view", "settings.manage") }, only: %i[index show]
      before_action -> { require_permission!("settings.manage") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        scope = FixedAsset.includes(:gl_account).order(:purchased_on)
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows = scope.to_a
        render json: { data: rows.map { |a| FinanceSerializers.fixed_asset(a) }, totals: { cost_minor: rows.sum(&:cost_minor), accumulated_minor: rows.sum(&:accumulated_minor), book_value_minor: rows.sum(&:book_value_minor) } }
      end

      def show = render(json: FinanceSerializers.fixed_asset(FixedAsset.find(params[:id])))

      # POST /finance/fixed_assets { name, gl_account_id, cost_minor, salvage_minor, purchased_on, useful_life_months, note, paid_from: account id | payable | capital }
      def create
        a = Finance::FixedAssets.create!(params.permit(:name, :gl_account_id, :cost_minor, :salvage_minor, :purchased_on, :useful_life_months, :note).to_h.symbolize_keys, actor: current_membership, branch: current_branch, paid_from: params[:paid_from])
        audit!("create", record: a, after: { name: a.name, cost_minor: a.cost_minor })
        render json: FinanceSerializers.fixed_asset(a), status: :created
      end

      def update
        a = FixedAsset.find(params[:id])
        a.update!(params.permit(:name, :note))
        render json: FinanceSerializers.fixed_asset(a)
      end

      def depreciate
        a = FixedAsset.find(params[:id])
        Finance::FixedAssets.depreciate!(a, through: params[:through].present? ? Date.parse(params[:through]) : today, actor: current_membership)
        render json: FinanceSerializers.fixed_asset(a.reload)
      end

      def dispose
        a = FixedAsset.find(params[:id])
        Finance::FixedAssets.dispose!(a, actor: current_membership, on: params[:on].present? ? Date.parse(params[:on]) : today, proceeds_minor: params[:proceeds_minor].to_i, proceeds_account_id: params[:proceeds_account_id].presence)
        render json: FinanceSerializers.fixed_asset(a.reload)
      end
    end
  end
end
