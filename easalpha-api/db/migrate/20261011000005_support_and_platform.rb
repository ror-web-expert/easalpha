# Help and Support box plus product-owner settings. A support request is a message from a business to EasAlpha's own
# team, answered by a super admin. Platform settings are EasAlpha-wide (support contact, hours, powered-by line) and
# are read by every app without a login.
class SupportAndPlatform < ActiveRecord::Migration[8.0]
  def up
    create_table :support_requests, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :membership_id
      t.string :category, null: false, default: "question"
      t.string :subject, null: false
      t.text :message, null: false
      t.string :status, null: false, default: "open"
      t.text :reply
      t.uuid :replied_by_super_admin_id
      t.datetime :replied_at
      t.datetime :closed_at
      t.string :page
      t.timestamps
    end
    add_index :support_requests, %i[business_id status]
    add_index :support_requests, %i[status created_at]
    add_check_constraint :support_requests, "status IN ('open','answered','closed')", name: "support_requests_status_check"
    add_check_constraint :support_requests, "category IN ('question','problem','billing','feature','other')", name: "support_requests_category_check"

    create_table :platform_settings, id: :uuid do |t|
      t.string :key, null: false
      t.jsonb :value
      t.timestamps
    end
    add_index :platform_settings, :key, unique: true
    EasAlpha::Rls.apply!(%w[support_requests])
  end

  def down
    drop_table :platform_settings
    drop_table :support_requests
  end
end
