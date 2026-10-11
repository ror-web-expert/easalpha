module Whatsapp
  # Thin facade over the WhatsApp provider. Without provider credentials messages are stored as "logged".
  module Sender
    module_function

    def send_otp(phone:, code:)
      deliver(phone: phone, template: "login_otp", variables: { code: code }, kind: "authentication", business: nil, counted: false)
    end

    def deliver(phone:, template:, variables: {}, kind: "utility", business: Current.business, customer_id: nil, counted: true)
      return nil if phone.blank?
      live = Provider.live?(business)
      msg = WhatsappMessage.create!(business_id: business&.id, to_phone: phone, template_name: template, variables: variables, kind: kind,
                                    customer_id: customer_id, status: live ? "queued" : "logged", counted_against_plan: counted)
      begin
        WhatsappDeliveryJob.perform_later(msg.id) if live
      rescue StandardError => e
        Rails.logger.error("[whatsapp] enqueue failed: #{e.message}")
      end
      msg
    end
  end
end
