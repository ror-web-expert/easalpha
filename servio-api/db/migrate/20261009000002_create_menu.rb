class CreateMenu < ActiveRecord::Migration[8.0]
  def up
    create_table :tax_rates, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.decimal :rate, precision: 6, scale: 3, null: false, default: 0
      t.boolean :inclusive, null: false, default: false
      t.string :authority, null: false, default: "none"
      t.boolean :active, null: false, default: true
      t.boolean :is_default, null: false, default: false
      t.timestamps
    end

    create_table :stations, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :printer_name
      t.uuid :display_device_id
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end

    create_table :menus, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.boolean :show_online, null: false, default: true
      t.jsonb :time_rules, null: false, default: {}
      t.integer :sort_order, null: false, default: 0
      t.boolean :is_default, null: false, default: false
      t.datetime :archived_at
      t.timestamps
    end

    create_table :categories, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :menu, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :name_ur
      t.string :image_key
      t.integer :sort_order, null: false, default: 0
      t.boolean :show_online, null: false, default: true
      t.uuid :station_id
      t.datetime :archived_at
      t.timestamps
    end
    add_index :categories, [ :menu_id, :sort_order ]

    create_table :products, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :category, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :name_ur
      t.text :description
      t.string :sku
      t.string :image_key
      t.bigint :base_price_minor, null: false, default: 0
      t.references :tax_rate, type: :uuid, foreign_key: true
      t.boolean :is_favourite, null: false, default: false
      t.boolean :show_online, null: false, default: true
      t.boolean :active, null: false, default: true
      t.boolean :sold_by_weight, null: false, default: false
      t.string :weight_unit
      t.string :allergens, array: true, null: false, default: []
      t.string :dietary_tags, array: true, null: false, default: []
      t.uuid :station_id
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end
    add_index :products, [ :business_id, :sku ], unique: true, where: "sku is not null and archived_at is null"
    add_index :products, [ :category_id, :sort_order ]

    create_table :product_variants, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.bigint :price_minor, null: false, default: 0
      t.string :sku
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end

    create_table :product_prices, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.uuid :variant_id
      t.uuid :branch_id
      t.string :order_type, null: false
      t.bigint :price_minor, null: false
      t.timestamps
    end
    add_index :product_prices, [ :product_id, :variant_id, :branch_id, :order_type ], unique: true, name: "idx_product_prices_unique"
    add_check_constraint :product_prices, "order_type in ('dine_in','takeaway','delivery','walk_in','online')", name: "product_prices_order_type_check"

    create_table :modifier_groups, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :min_select, null: false, default: 0
      t.integer :max_select, null: false, default: 1
      t.boolean :required, null: false, default: false
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end

    create_table :modifiers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :modifier_group, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :name_ur
      t.bigint :price_minor, null: false, default: 0
      t.uuid :stock_item_id
      t.decimal :quantity, precision: 14, scale: 3
      t.integer :sort_order, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    create_table :product_modifier_groups, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.references :modifier_group, type: :uuid, null: false, foreign_key: true
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :product_modifier_groups, [ :product_id, :modifier_group_id ], unique: true

    create_table :deals, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.text :description
      t.string :image_key
      t.bigint :price_minor, null: false
      t.boolean :active, null: false, default: true
      t.boolean :show_online, null: false, default: true
      t.datetime :valid_from
      t.datetime :valid_to
      t.references :tax_rate, type: :uuid, foreign_key: true
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end

    create_table :deal_items, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :deal, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.uuid :variant_id
      t.integer :quantity, null: false, default: 1
      t.string :choice_group
      t.timestamps
    end

    create_table :promotions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false
      t.decimal :value, precision: 12, scale: 2, null: false
      t.string :coupon_code
      t.string :applies_to, null: false, default: "order"
      t.uuid :target_ids, array: true, null: false, default: []
      t.integer :days, array: true, null: false, default: []
      t.time :start_time
      t.time :end_time
      t.datetime :valid_from
      t.datetime :valid_to
      t.integer :unit_limit
      t.integer :units_sold, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.bigint :min_order_minor, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end
    add_index :promotions, [ :business_id, :coupon_code ], unique: true, where: "coupon_code is not null and archived_at is null"
    add_check_constraint :promotions, "kind in ('percent','fixed','happy_hour','coupon')", name: "promotions_kind_check"

    create_table :import_jobs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.string :source, null: false
      t.string :status, null: false, default: "previewed"
      t.integer :row_count, null: false, default: 0
      t.jsonb :preview, null: false, default: {}
      t.jsonb :error_rows, null: false, default: []
      t.uuid :by_user_id
      t.timestamps
    end

    Servio::Rls.apply!(%w[tax_rates stations menus categories products product_variants product_prices modifier_groups modifiers product_modifier_groups deals deal_items promotions import_jobs])
  end

  def down
    drop_table :import_jobs, :promotions, :deal_items, :deals, :product_modifier_groups, :modifiers, :modifier_groups, :product_prices, :product_variants, :products, :categories, :menus, :stations, :tax_rates
  end
end
