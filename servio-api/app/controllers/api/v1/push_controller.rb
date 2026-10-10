module Api
  module V1
    # Browser push subscriptions for the signed-in member on this app (admin, pos, kitchen or rider).
    class PushController < BaseController
      before_action :authenticate!

      def public_key = render(json: { public_key: VapidKeypair.current.public_key })

      def index
        rows = PushSubscription.where(membership_id: current_membership.id).order(created_at: :desc)
        render json: { data: rows.map { |s| serialize(s) } }
      end

      # POST /push/subscriptions { endpoint, keys: { p256dh, auth }, app, user_agent }
      def create
        keys = params[:keys].respond_to?(:to_unsafe_h) ? params[:keys].to_unsafe_h : (params[:keys] || {}).to_h
        s = PushSubscription.find_or_initialize_by(endpoint: params.require(:endpoint).to_s)
        s.assign_attributes(membership_id: current_membership.id, device_id: current_device&.id, app: params[:app].presence_in(PushSubscription::APPS) || app_from_token,
                            p256dh: keys["p256dh"], auth: keys["auth"], user_agent: params[:user_agent].presence || request.user_agent.to_s[0, 200], failed_count: 0)
        s.save!
        render json: serialize(s), status: :created
      end

      def destroy
        PushSubscription.where(endpoint: params.require(:endpoint).to_s, membership_id: current_membership.id).destroy_all
        head :no_content
      end

      def test
        n = Push::Notifier.to_memberships([ current_membership.id ], title: "Servio test notification", body: "Push notifications are working on this device.", url: "/admin/settings/notifications", kind: "test")
        render json: { sent: n }, status: :accepted
      end

      private

      def app_from_token
        a = @claims && @claims[:app].to_s
        a == "pos" ? "pos" : (a.in?(PushSubscription::APPS) ? a : "admin")
      end

      def serialize(s) = { id: s.id, app: s.app, user_agent: s.user_agent, created_at: s.created_at, last_used_at: s.last_used_at }
    end
  end
end
