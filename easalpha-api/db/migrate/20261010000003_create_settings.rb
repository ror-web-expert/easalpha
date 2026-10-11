# SPEC: settings as a typed key-value store per outlet with seeded defaults and a version stamp for POS sync.
class CreateSettings < ActiveRecord::Migration[8.0]
  def up
    create_table :settings, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.string :key, null: false
      t.jsonb :value
      t.uuid :updated_by_user_id
      t.timestamps
    end
    add_index :settings, [ :business_id, :branch_id, :key ], unique: true, nulls_not_distinct: true
    add_column :businesses, :settings_version, :bigint, null: false, default: 0
    EasAlpha::Rls.apply!(%w[settings])
  end

  def down
    remove_column :businesses, :settings_version
    drop_table :settings
  end
end
