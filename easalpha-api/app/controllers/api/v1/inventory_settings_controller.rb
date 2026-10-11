module Api
  module V1
    class InventorySettingsController < BaseController
      before_action :authenticate!

      def show
        require_permission!("stock.view", "stock.actions", "stock.count", "settings.manage")
        render json: StockSerializers.settings(InventorySetting.current)
      end

      def update
        require_permission!("settings.manage", "stock.actions")
        s = InventorySetting.current
        before = StockSerializers.settings(s)
        s.update!(params.permit(:day_lock_date, :allow_manual_below_zero, :return_on_cancel, :weight_display, :volume_display, :food_cost_target_percent, :require_recipe_to_live, :deduct_stock_on_sale))
        audit!("update", record: s, before: before, after: StockSerializers.settings(s))
        render json: StockSerializers.settings(s)
      end

      # POST /inventory_settings/counting { open: true|false }  the counting switch that opens and closes a stocktake
      def counting
        require_permission!("stock.actions", "stock.count")
        s = InventorySetting.current
        s.update!(counting_open: ActiveModel::Type::Boolean.new.cast(params[:open]))
        audit!("counting", record: s, after: { counting_open: s.counting_open })
        render json: StockSerializers.settings(s)
      end
    end
  end
end
