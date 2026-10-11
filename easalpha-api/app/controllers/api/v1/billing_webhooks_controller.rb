module Api
  module V1
    # Paddle webhooks for international subscriptions. Signature checked when PADDLE_WEBHOOK_SECRET is set.
    class BillingWebhooksController < ActionController::API
      def paddle
        if ENV["PADDLE_WEBHOOK_SECRET"].present?
          sig = request.headers["Paddle-Signature"].to_s
          ts = sig[/ts=(\d+)/, 1]
          h1 = sig[/h1=([a-f0-9]+)/, 1]
          expected = OpenSSL::HMAC.hexdigest("SHA256", ENV["PADDLE_WEBHOOK_SECRET"], "#{ts}:#{request.raw_post}")
          return head :unauthorized unless h1 && ActiveSupport::SecurityUtils.secure_compare(expected, h1)
        end
        body = JSON.parse(request.raw_post) rescue {}
        data = body["data"] || {}
        business_id = data.dig("custom_data", "business_id")
        business = business_id && Business.find_by(id: business_id)
        return head :ok unless business
        case body["event_type"]
        when "subscription.activated", "subscription.updated", "transaction.completed"
          plan = Plan.find_by(code: data.dig("custom_data", "plan_code")) || business.plan || Plan.find_by!(code: "pro")
          cycle = data.dig("custom_data", "cycle") == "yearly" ? "yearly" : "monthly"
          Tenancy::Context.with(business) do
            sub = Billing::Lifecycle.activate!(business, plan: plan, cycle: cycle)
            sub.update!(provider: "paddle", provider_ref: data["id"])
          end
        when "subscription.canceled"
          Tenancy::Context.with(business) { business.subscriptions.order(created_at: :desc).first&.update!(status: "cancelled", cancelled_at: Time.current) }
        end
        head :ok
      end
    end
  end
end
