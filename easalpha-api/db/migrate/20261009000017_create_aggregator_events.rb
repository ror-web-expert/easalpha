class CreateAggregatorEvents < ActiveRecord::Migration[8.0]
  def up
    create_table :aggregator_events, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :provider, null: false
      t.string :external_id, null: false
      t.string :event, null: false
      t.jsonb :payload, null: false, default: {}
      t.string :status, null: false, default: "received"
      t.uuid :order_id
      t.string :error
      t.datetime :received_at, null: false
      t.timestamps
    end
    add_index :aggregator_events, [ :business_id, :provider, :external_id, :event ], unique: true, name: "idx_aggregator_events_unique"
    EasAlpha::Rls.apply!(%w[aggregator_events])
  end

  def down
    drop_table :aggregator_events
  end
end
