class CreatePurchasing < ActiveRecord::Migration[8.0]
  def up
    create_table :suppliers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :contact_name
      t.string :phone
      t.string :email
      t.text :address
      t.string :ntn
      t.bigint :opening_balance_minor, null: false, default: 0
      t.bigint :balance_minor, null: false, default: 0
      t.integer :payment_terms_days, null: false, default: 0
      t.text :notes
      t.boolean :active, null: false, default: true
      t.datetime :archived_at
      t.timestamps
    end
    add_index :suppliers, [:business_id, :name], unique: true, where: "archived_at is null"

    create_table :purchase_orders, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :supplier, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :status, null: false, default: "draft"
      t.date :expected_on
      t.bigint :total_minor, null: false, default: 0
      t.text :note
      t.uuid :by_membership_id
      t.datetime :sent_at
      t.datetime :received_at
      t.datetime :cancelled_at
      t.timestamps
    end
    add_index :purchase_orders, [:business_id, :number], unique: true
    add_check_constraint :purchase_orders, "status in ('draft','sent','partial','received','cancelled')", name: "purchase_orders_status_check"

    create_table :purchase_order_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :purchase_order, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :unit, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :base_quantity, precision: 14, scale: 3, null: false, default: 0
      t.bigint :unit_cost_minor, null: false, default: 0
      t.decimal :received_base_qty, precision: 14, scale: 3, null: false, default: 0
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end

    create_table :goods_receipts, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :supplier, type: :uuid, null: false, foreign_key: true
      t.references :purchase_order, type: :uuid, foreign_key: true
      t.references :stock_document, type: :uuid, foreign_key: true
      t.references :stock_section, type: :uuid, foreign_key: true
      t.integer :number, null: false
      t.string :status, null: false, default: "posted"
      t.string :invoice_ref
      t.string :invoice_key
      t.date :received_on, null: false
      t.date :business_day
      t.bigint :total_minor, null: false, default: 0
      t.text :note
      t.uuid :by_membership_id
      t.datetime :cancelled_at
      t.timestamps
    end
    add_index :goods_receipts, [:business_id, :number], unique: true

    create_table :goods_receipt_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :goods_receipt, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :unit, type: :uuid, null: false, foreign_key: true
      t.references :purchase_order_line, type: :uuid, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :base_quantity, precision: 14, scale: 3, null: false, default: 0
      t.bigint :unit_cost_minor, null: false, default: 0
      t.string :batch_no
      t.date :expires_on
      t.timestamps
    end

    create_table :purchase_returns, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :supplier, type: :uuid, null: false, foreign_key: true
      t.references :goods_receipt, type: :uuid, foreign_key: true
      t.references :stock_document, type: :uuid, foreign_key: true
      t.references :stock_section, type: :uuid, foreign_key: true
      t.integer :number, null: false
      t.string :status, null: false, default: "posted"
      t.string :reason
      t.string :settlement, null: false, default: "credit_note"
      t.bigint :amount_minor, null: false, default: 0
      t.uuid :payment_method_id
      t.uuid :payment_account_id
      t.date :returned_on, null: false
      t.date :business_day
      t.uuid :by_membership_id
      t.timestamps
    end
    add_index :purchase_returns, [:business_id, :number], unique: true
    add_check_constraint :purchase_returns, "settlement in ('credit_note','cash_refund')", name: "purchase_returns_settlement_check"

    create_table :purchase_return_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :purchase_return, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :unit, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :base_quantity, precision: 14, scale: 3, null: false, default: 0
      t.bigint :unit_cost_minor, null: false, default: 0
      t.timestamps
    end

    create_table :supplier_payments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.references :supplier, type: :uuid, null: false, foreign_key: true
      t.references :goods_receipt, type: :uuid, foreign_key: true
      t.integer :number, null: false
      t.string :direction, null: false, default: "paid"
      t.bigint :amount_minor, null: false
      t.uuid :payment_method_id
      t.uuid :payment_account_id
      t.string :reference
      t.text :note
      t.date :paid_on, null: false
      t.date :business_day, null: false
      t.uuid :by_membership_id
      t.uuid :shift_id
      t.timestamps
    end
    add_index :supplier_payments, [:business_id, :number], unique: true
    add_check_constraint :supplier_payments, "direction in ('paid','received')", name: "supplier_payments_direction_check"

    create_table :supplier_price_history, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :supplier, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :goods_receipt, type: :uuid, foreign_key: true
      t.references :unit, type: :uuid, foreign_key: true
      t.bigint :unit_cost_minor, null: false
      t.decimal :base_unit_cost_minor, precision: 18, scale: 6, null: false, default: 0
      t.date :observed_on, null: false
      t.timestamps
    end
    add_index :supplier_price_history, [:business_id, :stock_item_id, :observed_on]

    add_foreign_key :stock_documents, :suppliers, column: :supplier_id
    Servio::Rls.apply!(%w[suppliers purchase_orders purchase_order_lines goods_receipts goods_receipt_lines purchase_returns purchase_return_lines supplier_payments supplier_price_history])
  end

  def down
    remove_foreign_key :stock_documents, :suppliers
    %i[supplier_price_history supplier_payments purchase_return_lines purchase_returns goods_receipt_lines goods_receipts purchase_order_lines purchase_orders suppliers].each { |t| drop_table t }
  end
end
