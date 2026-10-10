require "net/http"

class WhatsappDeliveryJob < ApplicationJob
  queue_as :messages

  def perform(message_id)
    msg = WhatsappMessage.find_by(id: message_id)
    return unless msg && msg.status == "queued"
    unless Whatsapp::Provider.live?
      msg.update!(status: "logged")
      return
    end
    uri = URI("https://graph.facebook.com/v20.0/#{ENV.fetch('WHATSAPP_PHONE_NUMBER_ID')}/messages")
    req = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => "Bearer #{ENV['WHATSAPP_ACCESS_TOKEN']}")
    req.body = { messaging_product: "whatsapp", to: msg.to_phone.delete("+"), type: "template",
                 template: { name: msg.template_name, language: { code: "en" }, components: [{ type: "body", parameters: msg.variables.values.map { |v| { type: "text", text: v.to_s } } }] } }.to_json
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 15) { |http| http.request(req) }
    body = JSON.parse(res.body) rescue {}
    if res.is_a?(Net::HTTPSuccess)
      msg.update!(status: "sent", sent_at: Time.current, provider_message_id: body.dig("messages", 0, "id"))
    else
      msg.update!(status: "failed", error: body.dig("error", "message") || res.body.to_s[0, 500])
    end
  end
end
