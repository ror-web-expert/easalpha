class CreateExpensesAndDelivery < ActiveRecord::Migration[8.0]
  def up
    create_table :expense_categories, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.references :parent, type: :uuid, foreign_key: { to_table: :expense_categories }
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end
    add_index :expense_categories, [ :business_id, :parent_id, :name ], unique: true, where: "archived_at is null"

    create_table :expenses, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :category, type: :uuid, null: false, foreign_key: { to_table: :expense_categories }
      t.integer :number, null: false
      t.bigint :amount_minor, null: false
      t.uuid :payment_method_id
      t.uuid :payment_account_id
      t.uuid :shift_id
      t.uuid :client_id
      t.string :receipt_key
      t.string :paid_to
      t.text :note
      t.date :spent_on, null: false
      t.date :business_day, null: false
      t.string :source, null: false, default: "admin"
      t.uuid :by_membership_id
      t.uuid :approved_by_membership_id
      t.datetime :voided_at
      t.string :void_reason
      t.timestamps
    end
    add_index :expenses, [ :business_id, :number ], unique: true
    add_index :expenses, [ :business_id, :client_id ], unique: true, where: "client_id is not null"
    add_index :expenses, [ :branch_id, :business_day ]
    add_check_constraint :expenses, "source in ('admin','till','payroll_sync','rider_float')", name: "expenses_source_check"

    create_table :overheads, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false, default: "other"
      t.bigint :amount_minor, null: false
      t.string :basis, null: false, default: "per_month"
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_check_constraint :overheads, "kind in ('labor','gas','rent','utilities','other')", name: "overheads_kind_check"
    add_check_constraint :overheads, "basis in ('per_order','per_month','per_day')", name: "overheads_basis_check"

    create_table :delivery_zones, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.jsonb :polygon, null: false, default: []
      t.text :areas, array: true, null: false, default: []
      t.bigint :charge_minor, null: false, default: 0
      t.bigint :min_order_minor, null: false, default: 0
      t.integer :eta_minutes
      t.boolean :active, null: false, default: true
      t.datetime :archived_at
      t.timestamps
    end
    add_index :delivery_zones, [ :branch_id, :name ], unique: true, where: "archived_at is null"

    create_table :riders, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.references :membership, type: :uuid, foreign_key: true
      t.string :name, null: false
      t.string :phone
      t.string :vehicle
      t.string :vehicle_no
      t.text :address
      t.bigint :charge_per_delivery_minor, null: false, default: 0
      t.bigint :float_minor, null: false, default: 0
      t.string :status, null: false, default: "available"
      t.decimal :last_lat, precision: 10, scale: 7
      t.decimal :last_lng, precision: 10, scale: 7
      t.datetime :last_seen_at
      t.boolean :active, null: false, default: true
      t.datetime :archived_at
      t.timestamps
    end
    add_index :riders, [ :business_id, :membership_id ], unique: true, where: "membership_id is not null"

    create_table :deliveries, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true, index: { unique: true }
      t.references :rider, type: :uuid, foreign_key: true
      t.references :zone, type: :uuid, foreign_key: { to_table: :delivery_zones }
      t.uuid :address_id
      t.bigint :charge_minor, null: false, default: 0
      t.string :status, null: false, default: "unassigned"
      t.string :failed_reason
      t.bigint :cash_collected_minor
      t.uuid :settlement_id
      t.datetime :assigned_at
      t.datetime :picked_up_at
      t.datetime :delivered_at
      t.datetime :settled_at
      t.timestamps
    end
    add_index :deliveries, [ :rider_id, :status ]
    add_check_constraint :deliveries, "status in ('unassigned','assigned','picked_up','on_the_way','arrived','delivered','failed')", name: "deliveries_status_check"

    create_table :delivery_status_events, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :delivery, type: :uuid, null: false, foreign_key: true
      t.string :status, null: false
      t.decimal :lat, precision: 10, scale: 7
      t.decimal :lng, precision: 10, scale: 7
      t.string :note
      t.uuid :by_membership_id
      t.datetime :occurred_at, null: false
      t.datetime :synced_at
      t.datetime :created_at, null: false
    end

    create_table :rider_cash_movements, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :rider, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.bigint :amount_minor, null: false
      t.string :reason
      t.uuid :payment_account_id
      t.uuid :expense_id
      t.uuid :settlement_id
      t.uuid :shift_id
      t.uuid :by_membership_id
      t.date :business_day, null: false
      t.datetime :occurred_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :rider_cash_movements, [ :rider_id, :occurred_at ]
    add_check_constraint :rider_cash_movements, "kind in ('issue','return','spend','adjust','settle')", name: "rider_cash_movements_kind_check"

    create_table :rider_settlements, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :rider, type: :uuid, null: false, foreign_key: true
      t.uuid :shift_id
      t.integer :number, null: false
      t.integer :deliveries_count, null: false, default: 0
      t.bigint :cash_collected_minor, null: false, default: 0
      t.bigint :float_held_minor, null: false, default: 0
      t.bigint :spent_minor, null: false, default: 0
      t.bigint :expected_minor, null: false, default: 0
      t.bigint :handed_in_minor, null: false, default: 0
      t.bigint :difference_minor, null: false, default: 0
      t.uuid :payment_account_id
      t.text :note
      t.uuid :settled_by_membership_id
      t.datetime :settled_at, null: false
      t.timestamps
    end
    add_index :rider_settlements, [ :business_id, :number ], unique: true

    add_foreign_key :orders, :riders, column: :rider_id
    Servio::Rls.apply!(%w[expense_categories expenses overheads delivery_zones riders deliveries delivery_status_events rider_cash_movements rider_settlements])
  end

  def down
    remove_foreign_key :orders, :riders
    %i[rider_settlements rider_cash_movements delivery_status_events deliveries riders delivery_zones overheads expenses expense_categories].each { |t| drop_table t }
  end
end
