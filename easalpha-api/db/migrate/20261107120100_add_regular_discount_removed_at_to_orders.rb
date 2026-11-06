# When a manager took the regular discount off an order. It stays off that order: the next save that carries lines,
# online or from the sync queue, no longer puts it back (Marketing::RegularDiscounts.apply!).
class AddRegularDiscountRemovedAtToOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :regular_discount_removed_at, :datetime
  end
end
