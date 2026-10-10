# Short daily serial per branch and business day, assigned when an order is placed.
class OrderSerial < ApplicationRecord
  self.primary_key = nil

  def self.next!(branch_id:, business_day:)
    sql = <<~SQL
      INSERT INTO order_serials (branch_id, business_day, last_serial) VALUES ($1, $2, 1)
      ON CONFLICT (branch_id, business_day) DO UPDATE SET last_serial = order_serials.last_serial + 1
      RETURNING last_serial
    SQL
    connection.exec_query(sql, "OrderSerial.next", [ branch_id, business_day ]).first["last_serial"]
  end
end
