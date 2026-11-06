module Api
  module Errors
    class ApiError < StandardError
      attr_reader :code, :status, :details
      def initialize(code, message = nil, status: 400, details: nil)
        @code, @status, @details = code, status, details
        super(message || code.to_s.tr(".", " ").humanize)
      end
    end
    class BadRequest < ApiError; def initialize(code = "bad_request", message = nil, details: nil) = super(code, message, status: 400, details: details); end
    class Unauthorized < ApiError; def initialize(code = "unauthorized", message = "Login required") = super(code, message, status: 401); end
    class Forbidden < ApiError; def initialize(code = "forbidden", message = "You do not have permission to do this", details: nil) = super(code, message, status: 403, details: details); end
    class NotFound < ApiError; def initialize(code = "not_found", message = "Not found") = super(code, message, status: 404); end
    class Conflict < ApiError; def initialize(code = "conflict", message = nil, details: nil) = super(code, message, status: 409, details: details); end
    class Unprocessable < ApiError; def initialize(code = "validation_failed", message = "Validation failed", details: nil) = super(code, message, status: 422, details: details); end
    class ReadOnly < ApiError; def initialize = super("business.read_only", "This account is read-only. Renew the subscription to continue.", status: 403); end

    # A step a manager's PIN can allow. details.permissions names the codes, with their labels, so the till's PIN
    # dialog shows what is being approved and sends them back as approval_codes: the PIN then grants only those, not
    # everything the manager holds (review of 6 Nov 2026, R6).
    def self.approval_required(permissions, message = "A manager PIN is required for this action", code: "approval.required")
      codes = Array(permissions).map(&:to_s).uniq
      Forbidden.new(code, message, details: { permissions: codes, labels: codes.to_h { |c| [ c, Permission.entry(c)&.label || c ] } })
    end
  end
end
