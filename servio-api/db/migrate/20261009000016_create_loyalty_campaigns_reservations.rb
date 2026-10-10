class CreateLoyaltyCampaignsReservations < ActiveRecord::Migration[8.0]
  def up
    create_table :loyalty_transactions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :customer, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, foreign_key: true
      t.integer :points, null: false
      t.integer :balance_after, null: false, default: 0
      t.string :kind, null: false
      t.string :note
      t.uuid :by_membership_id
      t.datetime :occurred_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :loyalty_transactions, [:customer_id, :occurred_at]
    add_check_constraint :loyalty_transactions, "kind in ('earn','redeem','adjust','expire','refund')", name: "loyalty_transactions_kind_check"

    create_table :campaigns, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.jsonb :segment, null: false, default: {}
      t.text :body, null: false
      t.references :promotion, type: :uuid, foreign_key: true
      t.string :status, null: false, default: "draft"
      t.datetime :scheduled_at
      t.datetime :started_at
      t.datetime :finished_at
      t.integer :audience_count, null: false, default: 0
      t.integer :sent_count, null: false, default: 0
      t.integer :skipped_count, null: false, default: 0
      t.integer :redeemed_count, null: false, default: 0
      t.uuid :created_by_membership_id
      t.timestamps
    end
    add_check_constraint :campaigns, "status in ('draft','scheduled','sending','sent','cancelled')", name: "campaigns_status_check"
    add_column :whatsapp_messages, :campaign_id, :uuid
    add_index :whatsapp_messages, :campaign_id

    create_table :reservations, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :table, type: :uuid, foreign_key: { to_table: :dining_tables }
      t.references :customer, type: :uuid, foreign_key: true
      t.string :guest_name, null: false
      t.string :phone
      t.integer :party_size, null: false, default: 2
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.bigint :deposit_minor, null: false, default: 0
      t.uuid :deposit_payment_id
      t.string :status, null: false, default: "booked"
      t.text :notes
      t.datetime :reminder_sent_at
      t.datetime :seated_at
      t.uuid :order_id
      t.uuid :by_membership_id
      t.timestamps
    end
    add_index :reservations, [:branch_id, :starts_at]
    add_check_constraint :reservations, "status in ('booked','confirmed','seated','completed','no_show','cancelled')", name: "reservations_status_check"

    create_table :commission_rules, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :applies_to, null: false, default: "order_taker"
      t.string :role_key
      t.uuid :membership_id
      t.string :basis, null: false, default: "percent_of_sales"
      t.decimal :value, precision: 12, scale: 4, null: false
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_check_constraint :commission_rules, "applies_to in ('order_taker','waiter','cashier','rider')", name: "commission_rules_applies_check"
    add_check_constraint :commission_rules, "basis in ('percent_of_sales','per_order','per_item')", name: "commission_rules_basis_check"

    create_table :checklist_templates, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :kind, null: false
      t.jsonb :items, null: false, default: []
      t.boolean :required_for_shift, null: false, default: false
      t.timestamps
    end
    add_index :checklist_templates, [:business_id, :branch_id, :kind], unique: true
    add_check_constraint :checklist_templates, "kind in ('opening','closing')", name: "checklist_templates_kind_check"

    create_table :checklist_runs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.date :business_day, null: false
      t.uuid :shift_id
      t.jsonb :items, null: false, default: []
      t.integer :done_count, null: false, default: 0
      t.integer :total_count, null: false, default: 0
      t.datetime :completed_at
      t.uuid :started_by_membership_id
      t.uuid :completed_by_membership_id
      t.timestamps
    end
    add_index :checklist_runs, [:branch_id, :business_day, :kind], unique: true

    Servio::Rls.apply!(%w[loyalty_transactions campaigns reservations commission_rules checklist_templates checklist_runs])
  end

  def down
    %i[checklist_runs checklist_templates commission_rules reservations campaigns loyalty_transactions].each { |t| drop_table t }
    remove_column :whatsapp_messages, :campaign_id
  end
end
