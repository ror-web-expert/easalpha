# A till's queued record or a QR guest's submit that was applied (review of 6 Nov 2026, R17 and R18). The key is the
# till that sent it (none for a guest), what it was about (record_type, record_id) and the sender's own number for it
# (client_seq: the till's sequence for an order update, the guest's client id). The same key again is a repeat.
class AppliedSubmission < ApplicationRecord
  include Tenanted

  # True the first time a key is recorded, false when it was already there. Call it inside the transaction that
  # applies the submission: a failed apply takes the row with it, so a retry is applied; a repeat sent while the first
  # is still running waits on the unique index and then finds the committed row.
  def self.record!(record_type:, record_id:, client_seq:, device_id: nil, order_id: nil)
    business_id = Current.business_id or raise Tenanted::NoTenantError, "AppliedSubmission recorded without a business context"
    insert({ business_id: business_id, device_id: device_id, record_type: record_type, record_id: record_id, client_seq: client_seq.to_s, order_id: order_id }, returning: %w[id]).rows.any?
  end
end
