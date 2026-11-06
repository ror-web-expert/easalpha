# Review of 6 Nov 2026, R1: a price-embedded scale label prints what the pack costs, and the till worked out a 3-decimal
# weight from it, so Rs 50 of Rs 1,200/kg became 0.042 kg = Rs 50.40. The line keeps the printed price here and
# Orders::Pricing charges exactly that; the quantity stays the weight the price buys, for stock and the receipt.
class AddLabelPriceMinorToOrderItems < ActiveRecord::Migration[8.1]
  def change
    add_column :order_items, :label_price_minor, :bigint
    add_check_constraint :order_items, "label_price_minor IS NULL OR label_price_minor > 0", name: "order_items_label_price_positive"
  end
end
