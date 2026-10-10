module Tax
  # Picks the adapter for a branch. Without credentials the sandbox answers, so pilots can trade before approval.
  module Adapter
    class Error < StandardError; end
    Result = Struct.new(:number, :qr, :raw, keyword_init: true)

    def self.for(branch)
      reg = branch.tax_registration || {}
      authority = reg["authority"].to_s
      live = reg["token"].present? && ENV["TAX_#{authority.upcase}_URL"].present?
      case authority
      when "fbr" then live ? Adapters::Fbr.new(reg) : Adapters::Sandbox.new(authority)
      when "pra", "srb", "kpra", "bra" then live ? Adapters::Provincial.new(authority, reg) : Adapters::Sandbox.new(authority)
      else Adapters::Sandbox.new(authority.presence || "fbr")
      end
    end
  end
end
