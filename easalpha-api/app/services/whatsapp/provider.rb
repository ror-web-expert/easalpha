module Whatsapp
  # Which WhatsApp provider can send right now: the Meta Cloud API with credentials, or a phone linked by QR code.
  module Provider
    module_function

    def cloud? = ENV["WHATSAPP_ACCESS_TOKEN"].present? && ENV["WHATSAPP_PHONE_NUMBER_ID"].present?
    def mode(business) = business ? business.setting("whatsapp.provider").to_s : "cloud"

    # Live when the chosen provider can actually send: Meta credentials for cloud, a linked phone for web.
    def live?(business = Current.business)
      return cloud? if business.nil? || mode(business) == "cloud"
      Gateway.configured? && Gateway.connected?(business)
    end
  end
end
