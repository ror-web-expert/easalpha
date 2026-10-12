require "net/http"

class WhatsappDeliveryJob < ApplicationJob
  queue_as :messages

  def perform(message_id)
    msg = WhatsappMessage.find_by(id: message_id)
    return unless msg && msg.status == "queued"
    business = msg.business_id && Business.find_by(id: msg.business_id)
    return deliver_through_linked_phone(msg, business) if business && Whatsapp::Provider.mode(business) == "web"
    unless Whatsapp::Provider.cloud?
      msg.update!(status: "logged")
      return
    end
    uri = URI("https://graph.facebook.com/v20.0/#{ENV.fetch('WHATSAPP_PHONE_NUMBER_ID')}/messages")
    req = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => "Bearer #{ENV['WHATSAPP_ACCESS_TOKEN']}")
    req.body = { messaging_product: "whatsapp", to: msg.to_phone.delete("+"), type: "template",
                 template: { name: msg.template_name, language: { code: "en" }, components: [ { type: "body", parameters: msg.variables.values.map { |v| { type: "text", text: v.to_s } } } ] } }.to_json
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 15) { |http| http.request(req) }
    body = JSON.parse(res.body) rescue {}
    if res.is_a?(Net::HTTPSuccess)
      msg.update!(status: "sent", sent_at: Time.current, provider_message_id: body.dig("messages", 0, "id"))
    else
      msg.update!(status: "failed", error: body.dig("error", "message") || res.body.to_s[0, 500])
    end
  end

  private

  # The linked phone sends plain text: the template body with its variables filled, or the pre-rendered text.
  def deliver_through_linked_phone(msg, business)
    Tenancy::Context.with(business) do
      text = msg.variables["text"].presence || render_template(msg)
      doc = document_for(msg)
      id = doc ? Whatsapp::Gateway.send_document!(business, to: msg.to_phone, text: text, filename: doc[:filename], data: doc[:data]) : Whatsapp::Gateway.send_text!(business, to: msg.to_phone, text: text)
      msg.update!(status: "sent", sent_at: Time.current, provider_message_id: id)
    end
  rescue StandardError => e
    msg.update!(status: "failed", error: e.message.to_s[0, 500])
  end

  # A message can carry a document to attach, described rather than stored: the bill is rebuilt from the ledger.
  def document_for(msg)
    d = msg.variables["document"]
    return nil unless d.is_a?(Hash) && d["kind"] == "customer_bill"
    customer = Customer.find_by(id: d["customer_id"]) or return nil
    bill = Customers::Bill.build(customer, from: Date.parse(d["from"]), to: Date.parse(d["to"]), due_on: d["due_on"].present? ? Date.parse(d["due_on"]) : nil)
    { filename: bill[:filename], data: Customers::BillPdf.render([ bill ]) }
  end

  def render_template(msg)
    tpl = WhatsappTemplate.where(business_id: msg.business_id, name: msg.template_name).first || WhatsappTemplate.where(business_id: nil, name: msg.template_name, language: "en").first
    body = tpl&.body || msg.variables.values.join(" ")
    msg.variables.reduce(body) { |s, (k, v)| s.gsub("{{#{k}}}", v.to_s).gsub("{#{k}}", v.to_s) }
  end
end
