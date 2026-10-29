# Canteen (factory mess), 29 Oct 2026: a worker identifies by fingerprint at a kiosk, takes one dish from the day's plan
# for the current meal session, gets a token and collects at the counter; a second try in the same session is refused
# at the database (one live claim per worker, day and session). Every worker is also a customer, so the meal lands on
# their account and the month's meals come off the payroll run.
class Canteen < ActiveRecord::Migration[8.1]
  def change
    add_column :employees, :customer_id, :uuid
    add_index :employees, %i[business_id customer_id], unique: true, where: "customer_id IS NOT NULL"
    add_foreign_key :employees, :customers

    # Methods the system uses (company subsidy, salary deduction) that the till never offers.
    add_column :payment_methods, :internal, :boolean, null: false, default: false

    create_table :meal_sessions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.time :starts_at, null: false
      t.time :ends_at, null: false
      t.integer :max_claims, null: false, default: 1
      t.boolean :active, null: false, default: true
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end

    create_table :meal_plans, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :meal_session, type: :uuid, null: false, foreign_key: true
      t.date :plan_date, null: false
      t.string :status, null: false, default: "draft"
      t.text :notes
      t.datetime :published_at
      t.uuid :created_by_membership_id
      t.timestamps
    end
    add_index :meal_plans, %i[business_id branch_id meal_session_id plan_date], unique: true, name: "index_meal_plans_one_per_session_day"
    add_check_constraint :meal_plans, "status IN ('draft','published','closed')", name: "meal_plans_status_check"

    create_table :meal_plan_items, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :meal_plan, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.integer :planned_qty
      t.bigint :worker_price_minor
      t.integer :claims_count, null: false, default: 0
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :meal_plan_items, %i[meal_plan_id product_id], unique: true

    create_table :meal_claims, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :meal_session, type: :uuid, null: false, foreign_key: true
      t.references :meal_plan, type: :uuid, null: false, foreign_key: true
      t.references :meal_plan_item, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.uuid :customer_id
      t.uuid :order_id
      t.date :plan_date, null: false
      t.integer :token_no, null: false
      t.string :token_label, null: false
      t.string :status, null: false, default: "claimed"
      t.datetime :scanned_at, null: false
      t.datetime :served_at
      t.uuid :served_by_membership_id
      t.datetime :cancelled_at
      t.uuid :cancelled_by_membership_id
      t.text :cancel_reason
      t.uuid :device_id
      t.string :source, null: false, default: "fingerprint"
      t.string :fingerprint_id
      t.bigint :worker_price_minor, null: false, default: 0
      t.bigint :company_share_minor, null: false, default: 0
      t.datetime :client_created_at
      t.timestamps
    end
    add_index :meal_claims, %i[business_id employee_id plan_date meal_session_id], unique: true, where: "status <> 'cancelled'", name: "index_meal_claims_one_per_session"
    add_index :meal_claims, %i[branch_id plan_date meal_session_id token_no], unique: true, name: "index_meal_claims_token"
    add_index :meal_claims, %i[business_id plan_date status]
    add_index :meal_claims, :order_id
    add_check_constraint :meal_claims, "status IN ('claimed','served','cancelled')", name: "meal_claims_status_check"
    add_check_constraint :meal_claims, "source IN ('fingerprint','card','manual','code')", name: "meal_claims_source_check"
  end
end
