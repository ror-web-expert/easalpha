class CreatePlatform < ActiveRecord::Migration[8.0]
  def up
    create_table :plans, id: :uuid do |t|
      t.string :code, null: false
      t.string :name, null: false
      t.bigint :price_pkr_minor, null: false, default: 0
      t.bigint :price_usd_minor, null: false, default: 0
      t.jsonb :limits, null: false, default: {}
      t.jsonb :features, null: false, default: {}
      t.boolean :active, null: false, default: true
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :plans, :code, unique: true

    create_table :businesses, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :legal_name
      t.string :country, null: false, default: "PK", limit: 2
      t.string :currency, null: false, default: "PKR", limit: 3
      t.string :time_zone, null: false, default: "Asia/Karachi"
      t.string :phone
      t.string :email
      t.string :logo_key
      t.references :plan, type: :uuid, foreign_key: true
      t.date :trial_ends_on
      t.string :status, null: false, default: "trial"
      t.datetime :deleted_at
      t.jsonb :settings, null: false, default: {}
      t.timestamps
    end
    add_index :businesses, :slug, unique: true
    add_check_constraint :businesses, "status in ('trial','active','grace','read_only','deleted')", name: "businesses_status_check"

    create_table :branches, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :code, null: false
      t.string :address
      t.string :city
      t.string :phone
      t.string :time_zone, null: false, default: "Asia/Karachi"
      t.time :day_end_time, null: false, default: "04:00"
      t.jsonb :tax_registration, null: false, default: {}
      t.jsonb :opening_hours, null: false, default: {}
      t.boolean :is_main, null: false, default: false
      t.datetime :archived_at
      t.timestamps
    end
    add_index :branches, [ :business_id, :code ], unique: true

    create_table :users, id: :uuid do |t|
      t.string :phone
      t.string :email
      t.string :name, null: false
      t.string :password_digest
      t.string :locale, null: false, default: "en"
      t.boolean :two_factor_enabled, null: false, default: false
      t.datetime :last_login_at
      t.datetime :archived_at
      t.timestamps
    end
    add_index :users, :phone, unique: true, where: "phone is not null"
    add_index :users, :email, unique: true, where: "email is not null"

    create_table :roles, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :system_key
      t.boolean :is_system, null: false, default: false
      t.uuid :copied_from_role_id
      t.datetime :archived_at
      t.timestamps
    end
    add_index :roles, [ :business_id, :name ], unique: true, where: "archived_at is null"

    create_table :role_permissions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :role, type: :uuid, null: false, foreign_key: true
      t.string :permission_code, null: false
      t.decimal :limit_value, precision: 10, scale: 2
      t.timestamps
    end
    add_index :role_permissions, [ :role_id, :permission_code ], unique: true

    create_table :memberships, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :user, type: :uuid, null: false, foreign_key: true
      t.references :role, type: :uuid, null: false, foreign_key: true
      t.string :pin_digest
      t.integer :pin_failed_count, null: false, default: 0
      t.datetime :pin_locked_until
      t.string :status, null: false, default: "active"
      t.string :invited_via
      t.boolean :all_branches, null: false, default: true
      t.uuid :branch_ids, array: true, null: false, default: []
      t.datetime :deactivated_at
      t.timestamps
    end
    add_index :memberships, [ :business_id, :user_id ], unique: true
    add_check_constraint :memberships, "status in ('invited','active','deactivated')", name: "memberships_status_check"

    create_table :devices, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :code, null: false
      t.string :kind, null: false, default: "till"
      t.uuid :station_id
      t.string :pairing_code
      t.datetime :pairing_expires_at
      t.datetime :paired_at
      t.string :token_digest
      t.string :platform
      t.string :app_version
      t.datetime :last_sync_at
      t.datetime :last_seen_at
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :devices, [ :business_id, :branch_id, :code ], unique: true
    add_index :devices, :pairing_code, unique: true, where: "pairing_code is not null"
    add_check_constraint :devices, "kind in ('till','tablet','kitchen','customer_display','token_screen','kiosk')", name: "devices_kind_check"

    create_table :refresh_tokens, id: :uuid do |t|
      t.references :user, type: :uuid, foreign_key: true
      t.references :membership, type: :uuid, foreign_key: true
      t.references :device, type: :uuid, foreign_key: true
      t.string :token_digest, null: false
      t.string :app, null: false, default: "admin"
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.string :user_agent
      t.string :ip
      t.timestamps
    end
    add_index :refresh_tokens, :token_digest, unique: true

    create_table :otp_codes, id: :uuid do |t|
      t.string :phone, null: false
      t.string :code_digest, null: false
      t.string :purpose, null: false, default: "login"
      t.datetime :expires_at, null: false
      t.integer :attempts, null: false, default: 0
      t.datetime :consumed_at
      t.timestamps
    end
    add_index :otp_codes, [ :phone, :purpose ]

    create_table :subscriptions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :plan, type: :uuid, null: false, foreign_key: true
      t.string :billing_cycle, null: false, default: "monthly"
      t.string :status, null: false, default: "trialing"
      t.datetime :current_period_start
      t.datetime :current_period_end
      t.string :provider, null: false, default: "manual"
      t.string :provider_ref
      t.date :grace_ends_on
      t.timestamps
    end

    create_table :audit_logs, id: :uuid do |t|
      t.uuid :business_id
      t.uuid :branch_id
      t.uuid :user_id
      t.uuid :device_id
      t.uuid :approved_by_user_id
      t.string :action, null: false
      t.string :table_name
      t.uuid :record_id
      t.jsonb :before
      t.jsonb :after
      t.string :ip
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :audit_logs, [ :business_id, :table_name, :record_id ]
    add_index :audit_logs, [ :business_id, :occurred_at ]

    create_table :super_admins, id: :uuid do |t|
      t.string :email, null: false
      t.string :name, null: false
      t.string :password_digest, null: false
      t.datetime :last_login_at
      t.timestamps
    end
    add_index :super_admins, :email, unique: true

    create_table :setup_checklist_items, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :key, null: false
      t.string :title, null: false
      t.datetime :done_at
      t.boolean :plan_feature_off, null: false, default: false
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end
    add_index :setup_checklist_items, [ :business_id, :key ], unique: true

    create_table :feature_flags, id: :uuid do |t|
      t.string :key, null: false
      t.uuid :business_id
      t.boolean :enabled, null: false, default: false
      t.timestamps
    end
    add_index :feature_flags, [ :key, :business_id ], unique: true

    create_table :notifications, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :user_id
      t.string :kind, null: false
      t.string :title, null: false
      t.text :body
      t.string :link
      t.datetime :read_at
      t.timestamps
    end
    add_index :notifications, [ :business_id, :user_id, :read_at ]

    Servio::Rls.apply!(%w[branches roles role_permissions memberships devices subscriptions setup_checklist_items notifications])
  end

  def down
    drop_table :notifications, :feature_flags, :setup_checklist_items, :super_admins, :audit_logs, :subscriptions,
               :otp_codes, :refresh_tokens, :devices, :memberships, :role_permissions, :roles, :users, :branches, :businesses, :plans
  end
end
