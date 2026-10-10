class CreateCustomersAndTables < ActiveRecord::Migration[8.0]
  def up
    create_table :customer_groups, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.decimal :discount_percent, precision: 5, scale: 2, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end
    add_index :customer_groups, [:business_id, :name], unique: true, where: "archived_at is null"

    create_table :customers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.integer :khata_no, null: false
      t.string :name, null: false
      t.string :phone
      t.string :email
      t.string :company
      t.references :group, type: :uuid, foreign_key: { to_table: :customer_groups }
      t.string :source, null: false, default: "in_store"
      t.string :status, null: false, default: "active"
      t.boolean :is_walk_in, null: false, default: false
      t.bigint :credit_limit_minor
      t.bigint :balance_minor, null: false, default: 0
      t.integer :loyalty_points, null: false, default: 0
      t.date :birthday
      t.boolean :whatsapp_opt_in, null: false, default: false
      t.datetime :opt_in_at
      t.string :opt_in_source
      t.datetime :opted_out_at
      t.text :notes
      t.integer :orders_count, null: false, default: 0
      t.bigint :net_spent_minor, null: false, default: 0
      t.datetime :last_order_at
      t.datetime :archived_at
      t.timestamps
    end
    add_index :customers, [:business_id, :khata_no], unique: true
    add_index :customers, [:business_id, :phone], unique: true, where: "phone is not null and archived_at is null"
    add_index :customers, [:business_id], unique: true, where: "is_walk_in", name: "idx_customers_one_walk_in"
    add_check_constraint :customers, "source in ('in_store','online','qr','phone','import')", name: "customers_source_check"
    add_check_constraint :customers, "status in ('active','pending_approval','deactivated')", name: "customers_status_check"

    create_table :customer_addresses, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :customer, type: :uuid, null: false, foreign_key: true
      t.string :label
      t.string :line1, null: false
      t.string :line2
      t.string :area
      t.string :city
      t.decimal :lat, precision: 10, scale: 7
      t.decimal :lng, precision: 10, scale: 7
      t.boolean :is_default, null: false, default: false
      t.timestamps
    end

    add_column :orders, :waiter_membership_id, :uuid
    add_column :dining_tables, :waiter_membership_id, :uuid
    add_foreign_key :orders, :customers, column: :customer_id
    add_foreign_key :orders, :dining_tables, column: :table_id
    add_foreign_key :orders, :customer_addresses, column: :address_id

    Servio::Rls.apply!(%w[customer_groups customers customer_addresses])
  end

  def down
    remove_foreign_key :orders, :customer_addresses
    remove_foreign_key :orders, :dining_tables
    remove_foreign_key :orders, :customers
    remove_column :dining_tables, :waiter_membership_id
    remove_column :orders, :waiter_membership_id
    drop_table :customer_addresses, :customers, :customer_groups
  end
end
