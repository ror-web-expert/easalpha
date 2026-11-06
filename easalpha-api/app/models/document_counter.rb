# Sequential numbers per business for stock documents, purchase orders, receipts, returns and supplier payments.
class DocumentCounter < ApplicationRecord
  self.primary_key = nil

  # The upsert holds the counter row until the transaction ends, so two documents numbered at the same moment take
  # turns and never share a number. after: the highest number a table already holds (one numbered before it had a
  # counter), so the counter carries on from there instead of starting again at 1.
  def self.next!(kind, business_id: Current.business_id, after: 0)
    sql = <<~SQL
      INSERT INTO document_counters (business_id, kind, last_number) VALUES ($1, $2, $3::integer + 1)
      ON CONFLICT (business_id, kind) DO UPDATE SET last_number = GREATEST(document_counters.last_number, $3::integer) + 1
      RETURNING last_number
    SQL
    connection.exec_query(sql, "DocumentCounter.next", [ business_id, kind, after.to_i ]).first["last_number"]
  end
end
