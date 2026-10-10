class CreateRecipes < ActiveRecord::Migration[8.0]
  def up
    create_table :recipes, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, foreign_key: true
      t.references :variant, type: :uuid, foreign_key: { to_table: :product_variants }
      t.string :name, null: false
      t.decimal :yield_qty, precision: 14, scale: 3, null: false, default: 1
      t.references :yield_unit, type: :uuid, foreign_key: { to_table: :units }
      t.references :output_stock_item, type: :uuid, foreign_key: { to_table: :stock_items }
      t.references :source_section, type: :uuid, foreign_key: { to_table: :stock_sections }
      t.bigint :cost_minor, null: false, default: 0
      t.text :notes
      t.datetime :archived_at
      t.timestamps
    end
    add_index :recipes, [ :business_id, :product_id, :variant_id ], unique: true, where: "archived_at is null and product_id is not null", name: "idx_recipes_one_per_product_variant"
    add_index :recipes, [ :business_id, :output_stock_item_id ], unique: true, where: "archived_at is null and output_stock_item_id is not null", name: "idx_recipes_one_per_output_item"

    create_table :recipe_lines, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :recipe, type: :uuid, null: false, foreign_key: true
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.references :unit, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false
      t.decimal :base_quantity, precision: 14, scale: 3, null: false, default: 0
      t.decimal :waste_percent, precision: 5, scale: 2, null: false, default: 0
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end

    create_table :production_batches, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :recipe, type: :uuid, null: false, foreign_key: true
      t.references :stock_document, type: :uuid, foreign_key: true
      t.references :stock_section, type: :uuid, foreign_key: true
      t.decimal :quantity_produced, precision: 14, scale: 3, null: false
      t.bigint :cost_minor, null: false, default: 0
      t.datetime :produced_at, null: false
      t.uuid :by_membership_id
      t.timestamps
    end

    create_table :packaging_rules, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :order_type, null: false
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 1
      t.timestamps
    end
    add_index :packaging_rules, [ :business_id, :branch_id, :order_type, :stock_item_id ], unique: true, name: "idx_packaging_rules_unique"

    create_table :deduction_audits, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.string :status, null: false
      t.uuid :ledger_entry_ids, array: true, null: false, default: []
      t.jsonb :detail, null: false, default: {}
      t.datetime :checked_at, null: false
      t.timestamps
    end
    add_index :deduction_audits, [ :business_id, :status ]
    add_check_constraint :deduction_audits, "status in ('ok','missing','partial','reversed','waste','skipped','error')", name: "deduction_audits_status_check"

    add_column :orders, :stock_deducted_at, :datetime
    add_column :modifiers, :stock_unit_id, :uuid

    Servio::Rls.apply!(%w[recipes recipe_lines production_batches packaging_rules deduction_audits])
  end

  def down
    remove_column :modifiers, :stock_unit_id
    remove_column :orders, :stock_deducted_at
    drop_table :deduction_audits
    drop_table :packaging_rules
    drop_table :production_batches
    drop_table :recipe_lines
    drop_table :recipes
  end
end
