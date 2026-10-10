class AddRefLineToStockLedger < ActiveRecord::Migration[8.0]
  def change
    add_column :stock_ledger_entries, :ref_line_id, :uuid
    add_index :stock_ledger_entries, :ref_line_id
  end
end
