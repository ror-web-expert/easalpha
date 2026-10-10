# SPEC "Inventory and recipes": the till deducts once, at completion; a safety-net job re-runs lost deductions dated to
# the sale's day and can never deduct twice, which the unique index on sale movements guarantees.
class DeductionAtCompletion < ActiveRecord::Migration[8.0]
  def up
    add_index :stock_ledger_entries, [:ref_table, :ref_id, :ref_line_id, :stock_item_id, :stock_section_id, :kind],
              unique: true, where: "kind IN ('sale', 'packaging') AND reversed_by_entry_id IS NULL AND reverses_entry_id IS NULL",
              nulls_not_distinct: true, name: "index_stock_ledger_sale_deductions_unique"

    create_table :safety_net_runs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :trigger, null: false, default: "job"
      t.uuid :by_membership_id
      t.datetime :ran_at, null: false
      t.integer :checked, null: false, default: 0
      t.integer :deducted, null: false, default: 0
      t.integer :errors_count, null: false, default: 0
      t.jsonb :detail, null: false, default: {}
      t.timestamps
    end
    add_index :safety_net_runs, [:business_id, :ran_at]
    Servio::Rls.apply!(%w[safety_net_runs])
  end

  def down
    drop_table :safety_net_runs
    remove_index :stock_ledger_entries, name: "index_stock_ledger_sale_deductions_unique"
  end
end
