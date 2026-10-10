class CreateBilling < ActiveRecord::Migration[8.0]
  def up
    create_table :invoices, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :subscription, type: :uuid, foreign_key: true
      t.string :number, null: false
      t.bigint :amount_minor, null: false
      t.string :currency, null: false, default: "PKR", limit: 3
      t.date :due_on, null: false
      t.string :status, null: false, default: "open"
      t.string :pdf_key
      t.string :kind, null: false, default: "subscription"
      t.string :period_label
      t.string :payment_method
      t.string :payment_reference
      t.datetime :reported_at
      t.datetime :confirmed_at
      t.uuid :confirmed_by_super_admin_id
      t.jsonb :lines, null: false, default: []
      t.timestamps
    end
    add_index :invoices, :number, unique: true
    add_check_constraint :invoices, "status in ('open','reported','paid','void')", name: "invoices_status_check"

    create_table :payments_received, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :invoice, type: :uuid, foreign_key: true
      t.bigint :amount_minor, null: false
      t.string :method, null: false
      t.string :reference
      t.date :received_on, null: false
      t.uuid :confirmed_by_user_id
      t.timestamps
    end
    add_index :invoices, [:business_id, :status]
    change_table :subscriptions do |t|
      t.datetime :cancelled_at
      t.string :cancel_reason
      t.integer :tills, null: false, default: 1
    end
    change_table :businesses do |t|
      t.datetime :read_only_at
      t.datetime :trial_reminder_60_at
      t.datetime :trial_reminder_80_at
      t.datetime :trial_reminder_88_at
      t.integer :whatsapp_credits, null: false, default: 0
    end

    create_table :whatsapp_templates, id: :uuid do |t|
      t.uuid :business_id
      t.string :name, null: false
      t.string :language, null: false, default: "en"
      t.string :category, null: false, default: "utility"
      t.text :body, null: false
      t.string :variables, array: true, null: false, default: []
      t.string :meta_template_id
      t.string :approval_status, null: false, default: "draft"
      t.timestamps
    end
    add_index :whatsapp_templates, [:business_id, :name, :language], unique: true

    create_table :support_sessions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :super_admin_id, null: false
      t.string :reason, null: false
      t.string :status, null: false, default: "requested"
      t.uuid :approved_by_membership_id
      t.datetime :approved_at
      t.datetime :expires_at
      t.datetime :ended_at
      t.timestamps
    end
    add_index :support_sessions, [:business_id, :status]

    Servio::Rls.apply!(%w[invoices payments_received support_sessions])
  end

  def down
    drop_table :support_sessions, :whatsapp_templates
    remove_column :businesses, :whatsapp_credits
    remove_column :businesses, :trial_reminder_88_at
    remove_column :businesses, :trial_reminder_80_at
    remove_column :businesses, :trial_reminder_60_at
    remove_column :businesses, :read_only_at
    remove_column :subscriptions, :tills
    remove_column :subscriptions, :cancel_reason
    remove_column :subscriptions, :cancelled_at
    drop_table :payments_received, :invoices
  end
end
