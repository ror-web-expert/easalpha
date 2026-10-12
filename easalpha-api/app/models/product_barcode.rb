# A barcode or QR code that adds a product (or one of its variants) on the POS. quantity is the pack size: scanning a
# carton of six adds six. Codes are unique per business.
class ProductBarcode < ApplicationRecord
  include Tenanted
  belongs_to :product, touch: true
  belongs_to :variant, class_name: "ProductVariant", optional: true
  before_validation { self.code = code.to_s.strip }
  validates :code, presence: true, length: { maximum: 128 }, uniqueness: { scope: :business_id }
  validates :quantity, numericality: { greater_than: 0 }
  validate :variant_belongs_to_product

  private

  def variant_belongs_to_product
    errors.add(:variant_id, "is not a size of this product") if variant && variant.product_id != product_id
  end
end
