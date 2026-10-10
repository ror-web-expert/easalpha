module Api
  module V1
    class NotificationsController < BaseController
      before_action :authenticate!

      def index
        rows, cursor = paginate(Notification.where(user_id: [nil, current_user.id]))
        render_page(rows, cursor) { |n| Serializers.notification(n) }
      end

      def read
        n = Notification.where(user_id: [nil, current_user.id]).find(params[:id])
        n.update!(read_at: Time.current)
        render json: Serializers.notification(n)
      end
    end
  end
end
