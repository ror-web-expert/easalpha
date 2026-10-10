class CreateOrders < ActiveRecord::Migration[8.0]
  def up
    create_table :floors, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :sort_order, null: false, default: 0
      t.jsonb :layout, null: false, default: {}
      t.datetime :archived_at
      t.timestamps
    end

    create_table :dining_tables, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :floor, type: :uuid, foreign_key: true
      t.string :code, null: false
      t.string :name
      t.integer :seats, null: false, default: 4
      t.string :location
      t.string :status, null: false, default: "available"
      t.jsonb :position, null: false, default: {}
      t.string :qr_token, null: false
      t.uuid :merged_into_table_id
      t.uuid :current_order_id
      t.datetime :archived_at
      t.timestamps
    end
    add_index :dining_tables, [ :branch_id, :code ], unique: true, where: "archived_at is null"
    add_index :dining_tables, :qr_token, unique: true
    add_check_constraint :dining_tables, "status in ('available','occupied','reserved','bill_requested')", name: "dining_tables_status_check"

    create_table :order_serials, id: false do |t|
      t.uuid :branch_id, null: false
      t.date :business_day, null: false
      t.integer :last_serial, null: false, default: 0
    end
    add_index :order_serials, [ :branch_id, :business_day ], unique: true

    create_table :orders, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.uuid :device_id
      t.integer :serial
      t.string :till_serial
      t.date :business_day
      t.string :order_type, null: false, default: "walk_in"
      t.string :source, null: false, default: "till"
      t.string :status, null: false, default: "draft"
      t.uuid :table_id
      t.string :guest_name
      t.integer :covers
      t.uuid :customer_id
      t.uuid :address_id
      t.uuid :rider_id
      t.uuid :shift_id
      t.uuid :taken_by_membership_id
      t.uuid :completed_by_membership_id
      t.boolean :is_staff_meal, null: false, default: false
      t.string :staff_meal_reason
      t.uuid :staff_meal_approved_by_id
      t.bigint :subtotal_minor, null: false, default: 0
      t.bigint :discount_minor, null: false, default: 0
      t.bigint :service_charge_minor, null: false, default: 0
      t.bigint :tax_minor, null: false, default: 0
      t.bigint :rounding_minor, null: false, default: 0
      t.bigint :tip_minor, null: false, default: 0
      t.bigint :delivery_charge_minor, null: false, default: 0
      t.bigint :total_minor, null: false, default: 0
      t.bigint :paid_minor, null: false, default: 0
      t.string :payment_status, null: false, default: "unpaid"
      t.decimal :service_charge_percent, precision: 5, scale: 2, null: false, default: 0
      t.datetime :placed_at
      t.datetime :ready_at
      t.datetime :served_at
      t.datetime :paid_at
      t.datetime :closed_at
      t.datetime :voided_at
      t.string :void_reason
      t.uuid :void_approved_by_id
      t.string :aggregator_ref
      t.bigint :aggregator_commission_minor, null: false, default: 0
      t.text :notes
      t.datetime :client_created_at
      t.timestamps
    end
    add_index :orders, [ :business_id, :branch_id, :business_day ]
    add_index :orders, [ :business_id, :status ]
    add_index :orders, [ :business_id, :customer_id ]
    add_index :orders, [ :branch_id, :business_day, :serial ], unique: true, where: "serial is not null"
    add_check_constraint :orders, "order_type in ('dine_in','takeaway','delivery','walk_in')", name: "orders_order_type_check"
    add_check_constraint :orders, "source in ('till','qr','online','phone','foodpanda','kiosk')", name: "orders_source_check"
    add_check_constraint :orders, "status in ('draft','held','placed','preparing','ready','served','dispatched','paid','closed','voided','refunded')", name: "orders_status_check"
    add_check_constraint :orders, "payment_status in ('unpaid','partial','paid','refunded')", name: "orders_payment_status_check"

    create_table :order_items, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :product_id
      t.uuid :variant_id
      t.uuid :deal_id
      t.string :name_snapshot, null: false
      t.bigint :unit_price_minor, null: false
      t.decimal :tax_rate_snapshot, precision: 6, scale: 3, null: false, default: 0
      t.boolean :tax_inclusive_snapshot, null: false, default: false
      t.bigint :recipe_cost_minor_snapshot, null: false, default: 0
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 1
      t.string :unit
      t.bigint :modifiers_minor, null: false, default: 0
      t.bigint :line_subtotal_minor, null: false, default: 0
      t.bigint :line_discount_minor, null: false, default: 0
      t.bigint :line_tax_minor, null: false, default: 0
      t.bigint :line_total_minor, null: false, default: 0
      t.text :notes
      t.uuid :station_id
      t.integer :course, null: false, default: 1
      t.string :status, null: false, default: "pending"
      t.datetime :sent_at
      t.datetime :bumped_at
      t.string :cancelled_reason
      t.boolean :open_item, null: false, default: false
      t.boolean :price_overridden, null: false, default: false
      t.uuid :override_approved_by_id
      t.jsonb :deal_components, null: false, default: []
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :order_items, [ :order_id, :sort_order ]
    add_index :order_items, [ :business_id, :station_id, :status ]
    add_check_constraint :order_items, "status in ('pending','sent','preparing','ready','served','cancelled')", name: "order_items_status_check"

    create_table :order_item_modifiers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order_item, type: :uuid, null: false, foreign_key: true
      t.uuid :modifier_id
      t.string :name_snapshot, null: false
      t.bigint :price_minor_snapshot, null: false, default: 0
      t.decimal :quantity, precision: 14, scale: 3, null: false, default: 1
      t.timestamps
    end

    create_table :order_status_events, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.string :from_status
      t.string :to_status, null: false
      t.uuid :membership_id
      t.uuid :device_id
      t.string :reason
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :order_status_events, [ :order_id, :occurred_at ]

    create_table :discounts_applied, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :order_item_id
      t.uuid :promotion_id
      t.string :kind, null: false
      t.decimal :value, precision: 12, scale: 2, null: false
      t.bigint :amount_minor, null: false, default: 0
      t.string :reason
      t.uuid :applied_by_membership_id
      t.uuid :approved_by_membership_id
      t.timestamps
    end

    create_table :voids, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :order_item_id
      t.string :reason, null: false
      t.string :stock_action, null: false, default: "none"
      t.bigint :amount_minor, null: false, default: 0
      t.uuid :by_membership_id
      t.uuid :approved_by_membership_id
      t.datetime :voided_at, null: false
      t.timestamps
    end

    create_table :kitchen_tickets, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :station_id
      t.string :kind, null: false, default: "new"
      t.jsonb :lines, null: false, default: []
      t.integer :serial
      t.string :order_type
      t.string :table_code
      t.datetime :printed_at
      t.datetime :acknowledged_at
      t.timestamps
    end
    add_index :kitchen_tickets, [ :business_id, :branch_id, :station_id, :created_at ]
    add_check_constraint :kitchen_tickets, "kind in ('new','changed','cancelled','reprint')", name: "kitchen_tickets_kind_check"

    Servio::Rls.apply!(%w[floors dining_tables orders order_items order_item_modifiers order_status_events discounts_applied voids kitchen_tickets])
  end

  def down
    drop_table :kitchen_tickets, :voids, :discounts_applied, :order_status_events, :order_item_modifiers, :order_items, :orders, :order_serials, :dining_tables, :floors
  end
end
