# SPEC "Customers, credit, loyalty and feedback", "Settings and multi-outlet" (Website Config, WhatsApp, Notifications)
# and the report catalogue: regular discount tiers, voucher batches, reviews, loyalty redemption options, stored AI
# insights and the website configuration.
class Phase7CustomersReports < ActiveRecord::Migration[8.0]
  def up
    create_table :regular_discount_tiers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :within_days, null: false
      t.string :kind, null: false, default: "percent"
      t.decimal :value, precision: 12, scale: 2, null: false
      t.bigint :min_order_minor, null: false, default: 0
      t.uuid :excluded_product_ids, array: true, null: false, default: []
      t.uuid :excluded_category_ids, array: true, null: false, default: []
      t.string :excluded_order_types, array: true, null: false, default: []
      t.boolean :active, null: false, default: true
      t.datetime :archived_at
      t.timestamps
    end
    add_check_constraint :regular_discount_tiers, "kind IN ('percent','fixed')", name: "regular_discount_tiers_kind_check"

    create_table :voucher_batches, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false
      t.string :value_kind, null: false, default: "fixed"
      t.decimal :value, precision: 12, scale: 2, null: false
      t.bigint :min_spend_minor, null: false, default: 0
      t.date :expires_on
      t.integer :usage_limit
      t.string :public_code
      t.integer :issued_count, null: false, default: 0
      t.integer :redeemed_count, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.uuid :created_by_membership_id
      t.datetime :archived_at
      t.timestamps
    end
    add_check_constraint :voucher_batches, "kind IN ('personal','public') AND value_kind IN ('fixed','percent')", name: "voucher_batches_kind_check"
    add_index :voucher_batches, [:business_id, :public_code], unique: true, where: "public_code IS NOT NULL"

    create_table :vouchers, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :voucher_batch_id, null: false
      t.string :code, null: false
      t.uuid :customer_id
      t.uuid :redeemed_order_id
      t.datetime :redeemed_at
      t.datetime :sent_at
      t.uuid :whatsapp_message_id
      t.string :status, null: false, default: "issued"
      t.timestamps
    end
    add_index :vouchers, [:business_id, :code], unique: true
    add_index :vouchers, :voucher_batch_id
    add_index :vouchers, :customer_id
    add_check_constraint :vouchers, "status IN ('issued','redeemed','void')", name: "vouchers_status_check"

    create_table :reviews, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :order_id
      t.uuid :customer_id
      t.integer :rating
      t.text :comment
      t.string :source, null: false, default: "tablet"
      t.string :order_type
      t.bigint :order_total_minor, null: false, default: 0
      t.datetime :rated_at
      t.timestamps
    end
    add_index :reviews, :order_id
    add_index :reviews, [:business_id, :created_at]
    add_check_constraint :reviews, "rating IS NULL OR (rating >= 1 AND rating <= 5)", name: "reviews_rating_check"
    add_check_constraint :reviews, "source IN ('tablet','website','pos','qr')", name: "reviews_source_check"

    create_table :loyalty_redemption_options, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :points, null: false
      t.string :kind, null: false, default: "fixed"
      t.decimal :value, precision: 12, scale: 2, null: false
      t.boolean :active, null: false, default: true
      t.integer :sort_order, null: false, default: 0
      t.datetime :archived_at
      t.timestamps
    end
    add_check_constraint :loyalty_redemption_options, "kind IN ('fixed','percent','free_item')", name: "loyalty_redemption_options_kind_check"
    add_column :loyalty_redemption_options, :product_id, :uuid

    create_table :ai_insights, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.string :kind, null: false
      t.date :from_date
      t.date :to_date
      t.jsonb :payload, null: false, default: {}
      t.string :engine, null: false, default: "rules"
      t.datetime :generated_at, null: false
      t.timestamps
    end
    add_index :ai_insights, [:business_id, :kind, :generated_at]
    add_check_constraint :ai_insights, "kind IN ('pricing','stock_forecast')", name: "ai_insights_kind_check"

    create_table :website_configs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :slug
      t.boolean :published, null: false, default: false
      t.jsonb :sections, null: false, default: {}
      t.timestamps
    end
    add_index :website_configs, :business_id, unique: true, name: "index_website_configs_unique_business"
    add_index :website_configs, :slug, unique: true, where: "slug IS NOT NULL"

    add_column :discounts_applied, :regular_discount_tier_id, :uuid
    add_column :discounts_applied, :voucher_id, :uuid

    Servio::Rls.apply!(%w[regular_discount_tiers voucher_batches vouchers reviews loyalty_redemption_options ai_insights website_configs])
  end

  def down
    remove_column :discounts_applied, :voucher_id
    remove_column :discounts_applied, :regular_discount_tier_id
    drop_table :website_configs
    drop_table :ai_insights
    drop_table :loyalty_redemption_options
    drop_table :reviews
    drop_table :vouchers
    drop_table :voucher_batches
    drop_table :regular_discount_tiers
  end
end
