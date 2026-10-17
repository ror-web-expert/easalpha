# The order total is now rounded to whole rupees when it is computed (Orders::Rounding), so orders.rounding_minor holds
# that rounding plus any cash rounding, and the cash part needs a column of its own that recalculation keeps. Every
# rounding stored until now was cash rounding.
class AddCashRoundingMinorToOrders < ActiveRecord::Migration[8.0]
  def up
    add_column :orders, :cash_rounding_minor, :bigint, default: 0, null: false
    execute "UPDATE orders SET cash_rounding_minor = rounding_minor WHERE rounding_minor <> 0"
  end

  def down
    remove_column :orders, :cash_rounding_minor
  end
end
