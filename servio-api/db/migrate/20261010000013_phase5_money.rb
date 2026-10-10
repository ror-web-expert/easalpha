# SPEC "Purchasing, suppliers and expenses" and "Payments, charges, tax and the finance ledger": payments against a
# purchase order, manual supplier adjustments, a tax rate per finance account, service and delivery charges as a
# percent or a fixed amount, the wallet catalogue, and the double-entry chart of accounts, journals and fixed assets.
class Phase5Money < ActiveRecord::Migration[8.0]
  def up
    add_column :supplier_payments, :purchase_order_id, :uuid
    add_index :supplier_payments, :purchase_order_id
    add_column :purchase_orders, :paid_minor, :bigint, null: false, default: 0

    create_table :supplier_adjustments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :supplier_id, null: false
      t.bigint :amount_minor, null: false
      t.string :reason, null: false
      t.date :business_day, null: false
      t.uuid :by_membership_id
      t.timestamps
    end
    add_index :supplier_adjustments, :supplier_id

    add_column :tax_rates, :payment_account_id, :uuid
    add_column :orders, :service_charge_fixed_minor, :bigint, null: false, default: 0
    add_column :orders, :delivery_charge_percent, :decimal, precision: 5, scale: 2, null: false, default: 0
    add_column :orders, :tax_choice, :string
    add_column :orders, :tax_rate_id, :uuid
    add_column :payment_methods, :catalogue_code, :string

    create_table :gl_accounts, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :code, null: false
      t.string :name, null: false
      t.string :kind, null: false
      t.string :normal_side, null: false
      t.uuid :parent_id
      t.bigint :opening_balance_minor, null: false, default: 0
      t.boolean :is_system, null: false, default: false
      t.boolean :is_header, null: false, default: false
      t.uuid :payment_account_id
      t.text :description
      t.datetime :archived_at
      t.timestamps
    end
    add_index :gl_accounts, [ :business_id, :code ], unique: true
    add_index :gl_accounts, :payment_account_id
    add_check_constraint :gl_accounts, "kind IN ('asset', 'liability', 'equity', 'income', 'expense')", name: "gl_accounts_kind_check"
    add_check_constraint :gl_accounts, "normal_side IN ('debit', 'credit')", name: "gl_accounts_side_check"

    create_table :journal_entries, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.integer :number, null: false
      t.string :kind, null: false, default: "manual"
      t.date :business_day, null: false
      t.string :description
      t.string :ref_table
      t.uuid :ref_id
      t.uuid :reversed_by_id
      t.uuid :reverses_id
      t.uuid :by_membership_id
      t.datetime :posted_at, null: false
      t.timestamps
    end
    add_index :journal_entries, [ :business_id, :number ], unique: true
    add_index :journal_entries, [ :ref_table, :ref_id ]
    add_index :journal_entries, [ :business_id, :business_day ]

    create_table :journal_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :journal_entry_id, null: false
      t.uuid :gl_account_id, null: false
      t.bigint :debit_minor, null: false, default: 0
      t.bigint :credit_minor, null: false, default: 0
      t.string :description
      t.timestamps
    end
    add_index :journal_lines, :journal_entry_id
    add_index :journal_lines, :gl_account_id
    add_check_constraint :journal_lines, "debit_minor >= 0 AND credit_minor >= 0 AND (debit_minor = 0 OR credit_minor = 0)", name: "journal_lines_one_side"

    create_table :fixed_assets, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.string :name, null: false
      t.uuid :gl_account_id, null: false
      t.uuid :accumulated_account_id, null: false
      t.uuid :expense_account_id, null: false
      t.bigint :cost_minor, null: false
      t.bigint :salvage_minor, null: false, default: 0
      t.date :purchased_on, null: false
      t.integer :useful_life_months, null: false
      t.string :method, null: false, default: "straight_line"
      t.bigint :accumulated_minor, null: false, default: 0
      t.date :depreciated_through
      t.datetime :disposed_at
      t.string :status, null: false, default: "active"
      t.text :note
      t.timestamps
    end
    add_index :fixed_assets, :gl_account_id

    Servio::Rls.apply!(%w[supplier_adjustments gl_accounts journal_entries journal_lines fixed_assets])
  end

  def down
    drop_table :fixed_assets
    drop_table :journal_lines
    drop_table :journal_entries
    drop_table :gl_accounts
    drop_table :supplier_adjustments
    remove_column :payment_methods, :catalogue_code
    remove_column :orders, :tax_rate_id
    remove_column :orders, :tax_choice
    remove_column :orders, :delivery_charge_percent
    remove_column :orders, :service_charge_fixed_minor
    remove_column :tax_rates, :payment_account_id
    remove_column :purchase_orders, :paid_minor
    remove_column :supplier_payments, :purchase_order_id
  end
end
