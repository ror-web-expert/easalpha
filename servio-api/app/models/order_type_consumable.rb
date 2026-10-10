# SPEC "Order Inventory" tab: consumables charged by order type rather than by recipe (boxes, bags, fuel), set per
# order type and per variant, deducted with the sale. Branch-wide packaging rules stay as the Servio extra.
class OrderTypeConsumable < ApplicationRecord
  include Tenanted
  belongs_to :product
  belongs_to :variant, class_name: "ProductVariant", optional: true
  belongs_to :stock_item
  belongs_to :unit
  validates :order_type, inclusion: { in: Product::ORDER_TYPES }
  validates :quantity, numericality: { greater_than: 0 }

  # Quantity in the stock item's base unit.
  def base_quantity = unit.convert(quantity, to: stock_item.base_unit)

  # Replace a product's consumables. rows: [{variant_id, order_type, stock_item_id, quantity, unit_id}].
  # copy_all_order_types: the rows given for one order type are copied to every other order type.
  def self.replace!(product, rows, copy_all_order_types: false)
    rows = rows.map { |r| r.to_h.with_indifferent_access }
    if copy_all_order_types
      source = rows.first&.dig(:order_type)
      base = rows.select { |r| r[:order_type] == source }
      rows = Product::ORDER_TYPES.flat_map { |ot| base.map { |r| r.merge(order_type: ot) } }
    end
    transaction do
      where(product_id: product.id).delete_all
      rows.each do |r|
        create!(product: product, variant_id: r[:variant_id].presence, order_type: r[:order_type], stock_item_id: r[:stock_item_id], quantity: r[:quantity], unit_id: r[:unit_id])
      end
    end
  end

  # Consumables that apply to one order line: the variant's own rows, else the product-level rows.
  def self.for_line(product_id:, variant_id:, order_type:)
    scope = where(product_id: product_id, order_type: order_type).includes(:stock_item, :unit)
    rows = variant_id ? scope.where(variant_id: variant_id).to_a : []
    rows.any? ? rows : scope.where(variant_id: nil).to_a
  end
end
