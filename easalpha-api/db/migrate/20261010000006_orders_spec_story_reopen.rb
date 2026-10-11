# SPEC "Orders, order taking and tables": the order story, the reopen flow, the Mobile App source and a Maintenance table status.
class OrdersSpecStoryReopen < ActiveRecord::Migration[8.0]
  def up
    create_table :order_events, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.string :event_type, null: false
      t.uuid :membership_id
      t.string :user_name
      t.string :role_name
      t.uuid :device_id
      t.jsonb :diff
      t.bigint :amount_before
      t.bigint :amount_after
      t.string :note
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :order_events, [ :order_id, :occurred_at ]

    add_column :orders, :reopened_at, :datetime
    add_column :orders, :reopen_count, :integer, null: false, default: 0
    add_column :orders, :edit_count, :integer, null: false, default: 0
    add_column :orders, :unpaid_direct, :boolean, null: false, default: false

    remove_check_constraint :orders, name: "orders_source_check"
    add_check_constraint :orders, "source IN ('till', 'qr', 'online', 'app', 'phone', 'foodpanda', 'kiosk')", name: "orders_source_check"
    remove_check_constraint :dining_tables, name: "dining_tables_status_check"
    add_check_constraint :dining_tables, "status IN ('available', 'occupied', 'reserved', 'bill_requested', 'maintenance')", name: "dining_tables_status_check"

    EasAlpha::Rls.apply!(%w[order_events])
  end

  def down
    remove_check_constraint :dining_tables, name: "dining_tables_status_check"
    add_check_constraint :dining_tables, "status IN ('available', 'occupied', 'reserved', 'bill_requested')", name: "dining_tables_status_check"
    remove_check_constraint :orders, name: "orders_source_check"
    add_check_constraint :orders, "source IN ('till', 'qr', 'online', 'phone', 'foodpanda', 'kiosk')", name: "orders_source_check"
    remove_column :orders, :unpaid_direct
    remove_column :orders, :edit_count
    remove_column :orders, :reopen_count
    remove_column :orders, :reopened_at
    drop_table :order_events
  end
end
