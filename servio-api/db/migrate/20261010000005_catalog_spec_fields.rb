# SPEC "Menu and catalog": product discount (% or Rs), PCT code, category subtitle, deal favourite, order-type
# consumables per product and variant, and the Quick Add Menu.
class CatalogSpecFields < ActiveRecord::Migration[8.0]
  def up
    add_column :products, :discount_value, :decimal, precision: 12, scale: 2, null: false, default: 0
    add_column :products, :discount_type, :string, null: false, default: "percent"
    add_column :products, :pct_code, :string
    add_check_constraint :products, "discount_type IN ('percent', 'amount')", name: "products_discount_type_check"
    add_column :categories, :subtitle, :string
    add_column :deals, :is_favourite, :boolean, null: false, default: false

    create_table :order_type_consumables, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.uuid :variant_id
      t.string :order_type, null: false
      t.references :stock_item, type: :uuid, null: false, foreign_key: true
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 1
      t.uuid :unit_id, null: false
      t.timestamps
    end
    add_index :order_type_consumables, [ :product_id, :variant_id, :order_type, :stock_item_id ], unique: true, nulls_not_distinct: true, name: "index_consumables_unique"

    create_table :quick_add_items, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.uuid :variant_id
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :quick_add_items, [ :business_id, :product_id, :variant_id ], unique: true, nulls_not_distinct: true

    Servio::Rls.apply!(%w[order_type_consumables quick_add_items])
  end

  def down
    drop_table :quick_add_items
    drop_table :order_type_consumables
    remove_column :deals, :is_favourite
    remove_column :categories, :subtitle
    remove_check_constraint :products, name: "products_discount_type_check"
    remove_column :products, :pct_code
    remove_column :products, :discount_type
    remove_column :products, :discount_value
  end
end
