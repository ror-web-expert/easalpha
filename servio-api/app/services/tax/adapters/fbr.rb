require "net/http"

module Tax
  module Adapters
    # FBR POS integration. The request shape follows the FBR POS invoice API; field names are mapped from the order payload.
    class Fbr
      def initialize(reg) = @reg = reg

      def submit(invoice)
        uri = URI(ENV.fetch("TAX_FBR_URL"))
        req = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => "Bearer #{@reg['token']}")
        req.body = invoice.request_payload.to_json
        res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 15) { |http| http.request(req) }
        body = JSON.parse(res.body) rescue { "raw" => res.body }
        raise Tax::Adapter::Error, "FBR #{res.code}: #{body['Response'] || body['message'] || body['raw']}" unless res.is_a?(Net::HTTPSuccess) && body["InvoiceNumber"].present?
        Tax::Adapter::Result.new(number: body["InvoiceNumber"], qr: body["InvoiceNumber"], raw: body)
      end
    end

    class Provincial < Fbr
      def initialize(authority, reg)
        super(reg)
        @authority = authority
      end
    end
  end
end
