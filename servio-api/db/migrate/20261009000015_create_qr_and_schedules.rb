class CreateQrAndSchedules < ActiveRecord::Migration[8.0]
  def up
    add_column :branches, :qr_settings, :jsonb, null: false, default: {}
    add_column :orders, :qr_status, :string
    add_column :orders, :qr_guest_token, :string
    add_index :orders, [:branch_id, :qr_status], where: "qr_status is not null"
    add_check_constraint :orders, "qr_status is null or qr_status in ('pending','accepted','rejected')", name: "orders_qr_status_check"

    create_table :table_requests, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :table, type: :uuid, null: false, foreign_key: { to_table: :dining_tables }
      t.string :kind, null: false
      t.string :guest_name
      t.text :note
      t.datetime :requested_at, null: false
      t.uuid :handled_by_membership_id
      t.datetime :handled_at
      t.timestamps
    end
    add_index :table_requests, [:branch_id, :handled_at]
    add_check_constraint :table_requests, "kind in ('call_waiter','ask_bill')", name: "table_requests_kind_check"

    create_table :report_schedules, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false
      t.string :cadence, null: false, default: "daily"
      t.integer :hour, null: false, default: 9
      t.integer :weekday, null: false, default: 1
      t.integer :day_of_month, null: false, default: 1
      t.string :channel, null: false, default: "whatsapp"
      t.text :recipients, array: true, null: false, default: []
      t.boolean :active, null: false, default: true
      t.datetime :last_run_at
      t.datetime :next_run_at
      t.text :last_error
      t.uuid :created_by_membership_id
      t.timestamps
    end
    add_index :report_schedules, [:active, :next_run_at]
    add_check_constraint :report_schedules, "kind in ('daily_summary','sales','items','cashiers','grand','stock_sheet','expenses','payables','khata')", name: "report_schedules_kind_check"
    add_check_constraint :report_schedules, "cadence in ('daily','weekly','monthly')", name: "report_schedules_cadence_check"
    add_check_constraint :report_schedules, "channel in ('whatsapp','email','both')", name: "report_schedules_channel_check"

    Servio::Rls.apply!(%w[table_requests report_schedules])
  end

  def down
    drop_table :report_schedules
    drop_table :table_requests
    remove_index :orders, [:branch_id, :qr_status]
    remove_check_constraint :orders, name: "orders_qr_status_check"
    remove_column :orders, :qr_guest_token
    remove_column :orders, :qr_status
    remove_column :branches, :qr_settings
  end
end
