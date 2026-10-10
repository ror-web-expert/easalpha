class CreatePayments < ActiveRecord::Migration[8.0]
  def up
    create_table :payment_accounts, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.string :name, null: false
      t.string :kind, null: false
      t.boolean :is_default, null: false, default: false
      t.uuid :cashier_membership_id
      t.uuid :shift_id
      t.bigint :opening_balance_minor, null: false, default: 0
      t.bigint :current_balance_minor, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.string :bank_name
      t.string :account_no
      t.datetime :archived_at
      t.timestamps
    end
    add_index :payment_accounts, [ :business_id, :kind ]
    add_check_constraint :payment_accounts, "kind in ('cash','wallet','bank','drawer','custom')", name: "payment_accounts_kind_check"
    add_check_constraint :payment_accounts, "active or current_balance_minor = 0", name: "payment_accounts_inactive_zero_balance"

    create_table :payment_methods, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :code, null: false
      t.string :name, null: false
      t.string :kind, null: false
      t.references :payment_account, type: :uuid, foreign_key: true
      t.boolean :active, null: false, default: true
      t.boolean :works_offline, null: false, default: false
      t.boolean :needs_reference, null: false, default: false
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :payment_methods, [ :business_id, :code ], unique: true
    add_check_constraint :payment_methods, "kind in ('cash','card','wallet','bank','khata','qr','custom')", name: "payment_methods_kind_check"

    create_table :account_entries, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.references :payment_account, type: :uuid, null: false, foreign_key: true
      t.date :business_day, null: false
      t.string :kind, null: false
      t.bigint :amount_minor, null: false
      t.string :ref_table
      t.uuid :ref_id
      t.string :description
      t.uuid :by_membership_id
      t.uuid :shift_id
      t.uuid :verified_by_membership_id
      t.datetime :verified_at
      t.uuid :reversed_by_entry_id
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :account_entries, [ :business_id, :payment_account_id, :business_day ]
    add_index :account_entries, [ :business_id, :ref_table, :ref_id ]
    add_check_constraint :account_entries, "kind in ('order_payment','refund','expense','supplier_payment','customer_payment','customer_refund','transfer_in','transfer_out','deposit','withdrawal','adjustment','rider_float','opening','closing')", name: "account_entries_kind_check"

    create_table :payments, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id, null: false
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :shift_id
      t.references :payment_method, type: :uuid, null: false, foreign_key: true
      t.references :payment_account, type: :uuid, foreign_key: true
      t.string :method_code, null: false
      t.bigint :amount_minor, null: false
      t.bigint :tendered_minor
      t.bigint :change_minor, null: false, default: 0
      t.bigint :tip_minor, null: false, default: 0
      t.string :reference
      t.string :card_terminal_ref
      t.string :status, null: false, default: "captured"
      t.uuid :received_by_membership_id
      t.uuid :device_id
      t.uuid :customer_id
      t.date :business_day, null: false
      t.datetime :received_at, null: false
      t.datetime :client_created_at
      t.timestamps
    end
    add_index :payments, [ :business_id, :business_day ]
    add_check_constraint :payments, "status in ('captured','voided','refunded')", name: "payments_status_check"

    create_table :refunds, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id, null: false
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.uuid :payment_id
      t.references :payment_method, type: :uuid, null: false, foreign_key: true
      t.references :payment_account, type: :uuid, foreign_key: true
      t.bigint :amount_minor, null: false
      t.string :reason, null: false
      t.uuid :by_membership_id
      t.uuid :approved_by_membership_id
      t.uuid :shift_id
      t.date :business_day, null: false
      t.datetime :refunded_at, null: false
      t.timestamps
    end

    create_table :customer_payments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.references :customer, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :direction, null: false, default: "received"
      t.bigint :amount_minor, null: false
      t.references :payment_method, type: :uuid, foreign_key: true
      t.references :payment_account, type: :uuid, foreign_key: true
      t.string :reference
      t.uuid :collected_by_membership_id
      t.uuid :shift_id
      t.date :business_day, null: false
      t.datetime :received_at, null: false
      t.timestamps
    end
    add_index :customer_payments, [ :business_id, :number ], unique: true
    add_check_constraint :customer_payments, "direction in ('received','paid')", name: "customer_payments_direction_check"

    create_table :whatsapp_messages, id: :uuid do |t|
      t.uuid :business_id
      t.uuid :customer_id
      t.uuid :user_id
      t.string :to_phone, null: false
      t.string :template_name, null: false
      t.jsonb :variables, null: false, default: {}
      t.string :kind, null: false, default: "utility"
      t.string :status, null: false, default: "queued"
      t.string :provider_message_id
      t.string :error
      t.datetime :sent_at
      t.datetime :delivered_at
      t.datetime :read_at
      t.boolean :counted_against_plan, null: false, default: true
      t.timestamps
    end
    add_index :whatsapp_messages, [ :business_id, :created_at ]

    create_table :receipt_events, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.uuid :membership_id
      t.uuid :device_id
      t.string :channel
      t.timestamps
    end

    add_column :orders, :receipt_number, :string
    add_column :orders, :payment_method_summary, :string

    Servio::Rls.apply!(%w[payment_accounts payment_methods account_entries payments refunds customer_payments receipt_events])
  end

  def down
    remove_column :orders, :payment_method_summary
    remove_column :orders, :receipt_number
    drop_table :receipt_events, :whatsapp_messages, :customer_payments, :refunds, :payments, :account_entries, :payment_methods, :payment_accounts
  end
end
