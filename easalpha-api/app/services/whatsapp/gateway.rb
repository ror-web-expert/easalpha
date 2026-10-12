require "net/http"

module Whatsapp
  # Client for the easalpha-whatsapp gateway: a phone linked by scanning a QR code (WhatsApp Web style) that sends every
  # notification from that number. One session per business. Without a gateway URL the provider is unavailable.
  module Gateway
    module_function

    def url = ENV["WHATSAPP_GATEWAY_URL"].presence
    def token = ENV["WHATSAPP_GATEWAY_TOKEN"].to_s
    def configured? = url.present?
    def session_id(business = Current.business) = business.id.to_s

    def status(business = Current.business)
      return unavailable("Gateway not configured: set WHATSAPP_GATEWAY_URL") unless configured?
      request(:get, "/sessions/#{session_id(business)}")
    end

    def start!(business = Current.business)
      return unavailable("Gateway not configured: set WHATSAPP_GATEWAY_URL") unless configured?
      request(:post, "/sessions/#{session_id(business)}/start")
    end

    def logout!(business = Current.business)
      return unavailable("Gateway not configured: set WHATSAPP_GATEWAY_URL") unless configured?
      request(:post, "/sessions/#{session_id(business)}/logout")
    end

    def connected?(business = Current.business) = status(business)[:status] == "connected"

    # Sends plain text; returns the provider message id or raises.
    def send_text!(business, to:, text:)
      r = request(:post, "/sessions/#{session_id(business)}/send", { to: to.to_s.delete("+"), text: text })
      raise Api::Errors::Conflict.new("whatsapp.gateway", r[:last_error] || "The linked phone could not send") unless r[:ok]
      r[:message_id]
    end

    # Sends a file (a customer bill PDF) with the text as its caption; returns the provider message id or raises.
    def send_document!(business, to:, text:, filename:, data:, mimetype: "application/pdf")
      r = request(:post, "/sessions/#{session_id(business)}/send", { to: to.to_s.delete("+"), text: text,
                                                                      document: { base64: Base64.strict_encode64(data), filename: filename, mimetype: mimetype } }, read_timeout: 60)
      raise Api::Errors::Conflict.new("whatsapp.gateway", r[:last_error] || "The linked phone could not send") unless r[:ok]
      r[:message_id]
    end

    def unavailable(msg) = { status: "unavailable", qr: nil, phone: nil, last_error: msg }

    def request(verb, path, body = nil, read_timeout: 15)
      uri = URI("#{url}#{path}")
      req = verb == :get ? Net::HTTP::Get.new(uri) : Net::HTTP::Post.new(uri, "Content-Type" => "application/json")
      req["Authorization"] = "Bearer #{token}" if token.present?
      req.body = body.to_json if body
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: read_timeout) { |http| http.request(req) }
      data = JSON.parse(res.body) rescue {}
      data.transform_keys(&:to_sym).merge(ok: res.is_a?(Net::HTTPSuccess))
    rescue StandardError => e
      unavailable("Gateway unreachable: #{e.message}")
    end
  end
end
