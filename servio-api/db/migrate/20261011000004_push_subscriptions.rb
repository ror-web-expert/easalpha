# Browser push notifications (Web Push with VAPID): one subscription per browser per member and app, and the VAPID
# key pair for this installation when it is not supplied through the environment.
class PushSubscriptions < ActiveRecord::Migration[8.0]
  def up
    create_table :push_subscriptions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :membership_id, null: false
      t.uuid :device_id
      t.string :app, null: false, default: "admin"
      t.text :endpoint, null: false
      t.string :p256dh, null: false
      t.string :auth, null: false
      t.string :user_agent
      t.integer :failed_count, null: false, default: 0
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :push_subscriptions, :endpoint, unique: true
    add_index :push_subscriptions, :membership_id
    add_check_constraint :push_subscriptions, "app IN ('admin','pos','kitchen','rider')", name: "push_subscriptions_app_check"

    create_table :vapid_keypairs, id: :uuid do |t|
      t.text :public_key, null: false
      t.text :private_key, null: false
      t.timestamps
    end
    Servio::Rls.apply!(%w[push_subscriptions])
  end

  def down
    drop_table :vapid_keypairs
    drop_table :push_subscriptions
  end
end
