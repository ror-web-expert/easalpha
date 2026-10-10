class CreateUserPermissions < ActiveRecord::Migration[8.0]
  def up
    create_table :user_permissions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :membership, type: :uuid, null: false, foreign_key: true
      t.string :permission_code, null: false
      t.datetime :granted_at, null: false
      t.uuid :granted_by_user_id
      t.timestamps
    end
    add_index :user_permissions, [ :membership_id, :permission_code ], unique: true

    # "role": codes come from the role (as before). "custom": user_permissions is the whole truth.
    add_column :memberships, :permissions_mode, :string, null: false, default: "role"
    add_check_constraint :memberships, "permissions_mode IN ('role', 'custom')", name: "memberships_permissions_mode_check"

    Servio::Rls.apply!(%w[user_permissions])
  end

  def down
    remove_check_constraint :memberships, name: "memberships_permissions_mode_check"
    remove_column :memberships, :permissions_mode
    drop_table :user_permissions
  end
end
