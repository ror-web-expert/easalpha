class AddPreordersToOrders < ActiveRecord::Migration[8.0]
  def change
    add_column :orders, :scheduled_for, :datetime
    add_column :orders, :preorder_notified_at, :datetime
    add_index :orders, [ :branch_id, :scheduled_for ], where: "scheduled_for is not null"
  end
end
