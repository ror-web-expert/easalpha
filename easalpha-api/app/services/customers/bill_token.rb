module Customers
  # Signed, URL-safe token for the public bill link sent on WhatsApp: names the business, customer and period, and
  # expires after 120 days. Nothing is stored; the bill is rebuilt from the ledger when the link is opened.
  module BillToken
    module_function

    TTL = 120.days

    def verifier
      @verifier ||= ActiveSupport::MessageVerifier.new(Rails.application.key_generator.generate_key("easalpha customer bill", 32), url_safe: true, serializer: JSON)
    end

    def generate(customer, from:, to:, due_on: nil)
      verifier.generate({ "b" => customer.business_id, "c" => customer.id, "f" => from.to_s, "t" => to.to_s, "d" => due_on&.to_s }, expires_in: TTL, purpose: :bill)
    end

    # Returns { business_id, customer_id, from, to, due_on } or nil when the token is wrong or expired.
    def read(token)
      h = verifier.verified(token.to_s, purpose: :bill)
      return nil unless h.is_a?(Hash)
      { business_id: h["b"], customer_id: h["c"], from: Date.parse(h["f"]), to: Date.parse(h["t"]), due_on: h["d"].present? ? Date.parse(h["d"]) : nil }
    rescue ArgumentError, Date::Error
      nil
    end

    def url(customer, from:, to:, due_on: nil)
      base = ENV["PUBLIC_WEB_URL"].presence || ENV["WEB_URL"].presence || (Rails.env.production? ? "https://easalpha.com" : "http://localhost:3000")
      "#{base.chomp('/')}/bill/#{generate(customer, from: from, to: to, due_on: due_on)}"
    end
  end
end
