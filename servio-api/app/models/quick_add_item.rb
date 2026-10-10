# SPEC Quick Add Menu: a short pinned list of fast movers staff fire onto a running order in one tap.
class QuickAddItem < ApplicationRecord
  include Tenanted
  belongs_to :product
  belongs_to :variant, class_name: "ProductVariant", optional: true
  scope :ordered, -> { order(:position) }

  # Replace the list. rows: [{product_id, variant_id}] in display order.
  def self.replace!(rows)
    transaction do
      delete_all
      rows.each_with_index { |r, i| create!(product_id: r[:product_id], variant_id: r[:variant_id].presence, position: i) }
    end
  end
end
