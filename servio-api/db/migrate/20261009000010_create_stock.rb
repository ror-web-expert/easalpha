class CreateStock < ActiveRecord::Migration[8.0]
  def up
    create_table :units, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :code, null: false
      t.string :name, null: false
      t.string :kind, null: false
      t.decimal :factor_to_base, precision: 18, scale: 9, null: false, default: 1
      t.boolean :is_base, null: false, default: false
      t.datetime :archived_at
      t.timestamps
    end
    add_index :units, [:business_id, :code], unique: true
    add_check_constraint :units, "kind in ('weight','volume','count')", name: "units_kind_check"

    create_table :stock_sections, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :sort_order, null: false, default: 0
      t.boolean :is_default, null: false, default: false
      t.datetime :archived_at
      t.timestamps
    end
    add_index :stock_sections, [:branch_id, :name], unique: true, where: "archived_at is null"

    create_table :stock_items, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :name_ur
      t.string :sku
      t.string :category
      t.references :base_unit, type: :uuid, null: false, foreign_key: { to_table: :units }
      t.references :purchase_unit, type: :uuid, foreign_key: { to_table: :units }
      t.decimal :minimum_qty, precision: 14, scale: 3, null: false, default: 0
      t.decimal :reorder_qty, precision: 14, scale: 3, null: false, default: 0
      t.decimal :avg_cost_minor_per_base, precision: 18, scale: 6, null: false, default: 0
      t.boolean :track_expiry, null: false, default: false
      t.string :barcode
      t.boolean :is_packaging, null: false, default: false
      t.datetime :archived_at
      t.timestamps
    end
    add_index :stock_items, [:business_id, :sku], unique: true, where: "sku is not null and archived_at is null"
    add_index :stock_items, [:business_id, :name]

    create_table :stock_levels, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :stock_section, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 0
      t.bigint :value_minor, null: false, default: 0
      t.timestamps
    end
    add_index :stock_levels, [:stock_section_id, :stock_item_id], unique: true

    create_table :document_counters, id: false do |t|
      t.uuid :business_id, null: false
      t.string :kind, null: false
      t.integer :last_number, null: false, default: 0
    end
    add_index :document_counters, [:business_id, :kind], unique: true

    create_table :stock_documents, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :kind, null: false
      t.string :status, null: false, default: "draft"
      t.uuid :from_section_id
      t.uuid :to_section_id
      t.uuid :supplier_id
      t.uuid :goods_receipt_id
      t.uuid :client_id
      t.string :reason
      t.string :invoice_ref
      t.text :note
      t.date :business_day
      t.datetime :posted_at
      t.datetime :cancelled_at
      t.uuid :by_membership_id
      t.uuid :posted_by_membership_id
      t.timestamps
    end
    add_index :stock_documents, [:business_id, :number], unique: true
    add_index :stock_documents, [:business_id, :client_id], unique: true, where: "client_id is not null"
    add_index :stock_documents, [:branch_id, :business_day, :kind]
    add_check_constraint :stock_documents, "kind in ('receive','transfer','waste','adjustment','count','production','supplier_return')", name: "stock_documents_kind_check"
    add_check_constraint :stock_documents, "status in ('draft','posted','cancelled')", name: "stock_documents_status_check"

    create_table :stock_document_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :stock_document, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :unit, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 0
      t.decimal :base_quantity, precision: 14, scale: 3, null: false, default: 0
      t.bigint :unit_cost_minor
      t.string :batch_no
      t.date :expires_on
      t.decimal :counted_qty, precision: 14, scale: 3
      t.decimal :expected_qty, precision: 14, scale: 3
      t.string :note
      t.timestamps
    end

    create_table :stock_ledger_entries, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :stock_section, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.date :business_day, null: false
      t.string :kind, null: false
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :before_qty, precision: 14, scale: 3, null: false
      t.decimal :after_qty, precision: 14, scale: 3, null: false
      t.decimal :unit_cost_minor, precision: 18, scale: 6, null: false, default: 0
      t.bigint :value_minor, null: false, default: 0
      t.string :ref_table
      t.uuid :ref_id
      t.string :reason
      t.uuid :punched_by_membership_id
      t.uuid :completed_by_membership_id
      t.uuid :reversed_by_entry_id
      t.uuid :reverses_entry_id
      t.datetime :occurred_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :stock_ledger_entries, [:business_id, :stock_item_id, :occurred_at]
    add_index :stock_ledger_entries, [:business_id, :ref_id]
    add_index :stock_ledger_entries, [:stock_section_id, :business_day]
    add_check_constraint :stock_ledger_entries, "kind in ('sale','sale_return','receive','transfer_in','transfer_out','waste','adjustment','count','production_in','production_out','supplier_return','packaging','opening')", name: "stock_ledger_kind_check"
    Servio::Triggers.apply!(connection)

    create_table :inventory_settings, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true, index: { unique: true }
      t.date :day_lock_date
      t.boolean :counting_open, null: false, default: false
      t.boolean :allow_manual_below_zero, null: false, default: false
      t.boolean :return_on_cancel, null: false, default: true
      t.string :weight_display, null: false, default: "auto"
      t.string :volume_display, null: false, default: "auto"
      t.decimal :food_cost_target_percent, precision: 5, scale: 2, null: false, default: 35
      t.boolean :require_recipe_to_live, null: false, default: false
      t.boolean :deduct_stock_on_sale, null: false, default: true
      t.timestamps
    end

    Servio::Rls.apply!(%w[units stock_sections stock_items stock_levels document_counters stock_documents stock_document_lines stock_ledger_entries inventory_settings])
  end

  def down
    execute "DROP TRIGGER IF EXISTS stock_ledger_insert_only ON stock_ledger_entries; DROP FUNCTION IF EXISTS servio_block_ledger_change();"
    drop_table :inventory_settings
    drop_table :stock_ledger_entries
    drop_table :stock_document_lines
    drop_table :stock_documents
    drop_table :document_counters
    drop_table :stock_levels
    drop_table :stock_items
    drop_table :stock_sections
    drop_table :units
  end
end
