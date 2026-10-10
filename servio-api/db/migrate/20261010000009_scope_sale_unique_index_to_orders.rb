# The never-twice guarantee is for sale deductions that belong to an order; movements written without a reference stay free.
class ScopeSaleUniqueIndexToOrders < ActiveRecord::Migration[8.0]
  def up
    remove_index :stock_ledger_entries, name: "index_stock_ledger_sale_deductions_unique"
    add_index :stock_ledger_entries, [ :ref_table, :ref_id, :ref_line_id, :stock_item_id, :stock_section_id, :kind ],
              unique: true, where: "kind IN ('sale', 'packaging') AND ref_id IS NOT NULL AND reversed_by_entry_id IS NULL AND reverses_entry_id IS NULL",
              nulls_not_distinct: true, name: "index_stock_ledger_sale_deductions_unique"
  end

  def down
    remove_index :stock_ledger_entries, name: "index_stock_ledger_sale_deductions_unique"
    add_index :stock_ledger_entries, [ :ref_table, :ref_id, :ref_line_id, :stock_item_id, :stock_section_id, :kind ],
              unique: true, where: "kind IN ('sale', 'packaging') AND reversed_by_entry_id IS NULL AND reverses_entry_id IS NULL",
              nulls_not_distinct: true, name: "index_stock_ledger_sale_deductions_unique"
  end
end
