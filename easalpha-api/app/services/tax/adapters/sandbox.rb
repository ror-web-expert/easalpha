module Tax
  module Adapters
    # Returns a well-formed invoice number and QR payload without calling anyone. Used until credentials are configured.
    class Sandbox
      def initialize(authority) = @authority = authority

      def submit(invoice)
        raise Tax::Adapter::Error, "sandbox forced failure" if invoice.request_payload["force_failure"]
        number = "#{@authority.upcase}-SB-#{Time.current.strftime('%Y%m%d')}-#{SecureRandom.hex(4).upcase}"
        Tax::Adapter::Result.new(number: number, qr: "#{number}|#{invoice.request_payload['total_minor']}|#{invoice.request_payload['ntn']}", raw: { "sandbox" => true, "number" => number })
      end
    end
  end
end
