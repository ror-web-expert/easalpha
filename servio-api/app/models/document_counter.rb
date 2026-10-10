# Sequential numbers per business for stock documents, purchase orders, receipts, returns and supplier payments.
class DocumentCounter < ApplicationRecord
  self.primary_key = nil

  def self.next!(kind, business_id: Current.business_id)
    sql = <<~SQL
      INSERT INTO document_counters (business_id, kind, last_number) VALUES ($1, $2, 1)
      ON CONFLICT (business_id, kind) DO UPDATE SET last_number = document_counters.last_number + 1
      RETURNING last_number
    SQL
    connection.exec_query(sql, "DocumentCounter.next", [ business_id, kind ]).first["last_number"]
  end
end
