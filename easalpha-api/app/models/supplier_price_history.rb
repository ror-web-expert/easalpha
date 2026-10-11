class SupplierPriceHistory < ApplicationRecord
  self.table_name = "supplier_price_history"
  include Tenanted
  belongs_to :supplier
  belongs_to :stock_item
  belongs_to :goods_receipt, optional: true
  belongs_to :unit, optional: true
end
