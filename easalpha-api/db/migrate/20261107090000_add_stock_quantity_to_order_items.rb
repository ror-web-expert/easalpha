# The quantity of an order line whose ingredients are on the stock ledger (Stock::Deduction). An edited line on a
# reopened order then moves stock by the difference, and Retry or the safety net leave a line in step alone.
class AddStockQuantityToOrderItems < ActiveRecord::Migration[8.1]
  def up
    add_column :order_items, :stock_quantity, :decimal, precision: 14, scale: 3
    # Lines that already hold stock rows, and every line of an order already checked, stand at their quantity now.
    execute <<~SQL
      UPDATE order_items SET stock_quantity = quantity
      WHERE status <> 'cancelled' AND (
        id IN (SELECT ref_line_id FROM stock_ledger_entries
               WHERE ref_table = 'orders' AND kind IN ('sale', 'packaging') AND ref_line_id IS NOT NULL
                 AND reversed_by_entry_id IS NULL AND reverses_entry_id IS NULL)
        OR order_id IN (SELECT id FROM orders WHERE stock_deducted_at IS NOT NULL))
    SQL
  end

  def down
    remove_column :order_items, :stock_quantity
  end
end
