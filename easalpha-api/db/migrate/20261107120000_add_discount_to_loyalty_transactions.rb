# The loyalty discount a redemption paid for, and the one a refund gave back. A discount taken off its order gives its
# own points back once (Loyalty.refund_on_remove!), even on an order that carries two (two tables merged).
class AddDiscountToLoyaltyTransactions < ActiveRecord::Migration[8.1]
  def change
    add_column :loyalty_transactions, :discount_applied_id, :uuid
    add_index :loyalty_transactions, :discount_applied_id
  end
end
