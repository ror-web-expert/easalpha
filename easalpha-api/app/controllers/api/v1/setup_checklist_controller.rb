module Api
  module V1
    class SetupChecklistController < BaseController
      before_action :authenticate!

      def index
        items = SetupChecklistItem.order(:sort_order)
        render json: { data: items.map { |i| Serializers.checklist_item(i) }, done: items.count { |i| i.done_at }, total: items.size }
      end

      def complete
        item = SetupChecklistItem.find_by!(key: params[:key])
        item.update!(done_at: Time.current)
        render json: Serializers.checklist_item(item)
      end
    end
  end
end
