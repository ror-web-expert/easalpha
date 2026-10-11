module Api
  module V1
    # Inbound webhooks. WhatsApp status updates arrive here; the signature is checked when an app secret is set.
    class WebhooksController < ActionController::API
      def whatsapp_verify
        if params["hub.mode"] == "subscribe" && params["hub.verify_token"] == ENV.fetch("WHATSAPP_VERIFY_TOKEN", "easalpha")
          render plain: params["hub.challenge"]
        else
          head :forbidden
        end
      end

      def whatsapp
        if ENV["WHATSAPP_APP_SECRET"].present?
          expected = "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", ENV["WHATSAPP_APP_SECRET"], request.raw_post)
          return head :unauthorized unless ActiveSupport::SecurityUtils.secure_compare(expected, request.headers["X-Hub-Signature-256"].to_s)
        end
        body = JSON.parse(request.raw_post) rescue {}
        Array(body["entry"]).each do |entry|
          Array(entry["changes"]).each do |change|
            Array(change.dig("value", "statuses")).each do |st|
              msg = WhatsappMessage.find_by(provider_message_id: st["id"])
              next unless msg
              case st["status"]
              when "sent" then msg.update!(status: "sent", sent_at: Time.at(st["timestamp"].to_i))
              when "delivered" then msg.update!(status: "delivered", delivered_at: Time.at(st["timestamp"].to_i))
              when "read" then msg.update!(status: "read", read_at: Time.at(st["timestamp"].to_i))
              when "failed" then msg.update!(status: "failed", error: st.dig("errors", 0, "title"))
              end
            end
            Array(change.dig("value", "messages")).each do |m|
              text = m.dig("text", "body").to_s.strip.upcase
              next unless text == "STOP"
              phone = "+#{m['from']}"
              Tenancy::Context.unscoped { Customer.unscoped.where(phone: phone).update_all(whatsapp_opt_in: false, opted_out_at: Time.current) }
            end
          end
        end
        head :ok
      end
      # POST /webhooks/foodpanda/:slug  body signed with X-Signature: sha256=HMAC(secret, body)
      def foodpanda
        business = Tenancy::Context.unscoped { Business.find_by(slug: params[:slug]) }
        return render json: { error: { code: "not_found" } }, status: :not_found unless business
        body = request.raw_post
        return render json: { error: { code: "signature.invalid", message: "Bad signature" } }, status: :unauthorized unless Aggregators::Foodpanda.signature_valid?(business, body, request.headers["X-Signature"])
        payload = JSON.parse(body) rescue {}
        ev = Tenancy::Context.with(business) { Aggregators::Foodpanda.ingest!(business, payload) }
        render json: { ok: true, event_id: ev.id, status: ev.status, order_id: ev.order_id }
      rescue Api::Errors::ApiError => e
        render json: { error: { code: e.code, message: e.message } }, status: e.status
      end
    end
  end
end
