module Orders
  # The time a till says it made a record is kept (it dates the business day), but within a window: a till that was
  # offline for a week is believable, one whose clock says next year is not, and a clock an hour ahead is just a
  # clock. A time outside the window is moved to its edge and the move is written to the audit log, so the day the
  # record landed on can be explained later. Review of 6 Nov 2026, A6.
  module ClientTime
    PAST = 7.days
    FUTURE = 1.hour

    module_function

    # value: an ISO 8601 string (or nil). Returns a Time, or nil when blank.
    def clamp(value, table_name: "orders", record_id: nil)
      return nil if value.blank?
      t = Time.iso8601(value.to_s)
      now = Time.current
      bounded = t.clamp(now - PAST, now + FUTURE)
      return t if bounded == t
      AuditLog.record(action: "client_time_clamped", table_name: table_name, record_id: record_id,
                      before: { client_created_at: t.iso8601 }, after: { client_created_at: bounded.iso8601, window: "#{PAST.inspect} back, #{FUTURE.inspect} ahead" })
      bounded
    rescue ArgumentError
      raise Api::Errors::BadRequest.new("order.client_time", "client_created_at must be an ISO 8601 time")
    end
  end
end
