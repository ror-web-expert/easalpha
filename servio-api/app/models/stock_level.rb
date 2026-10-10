class StockLevel < ApplicationRecord
  include Tenanted
  belongs_to :stock_section
  belongs_to :stock_item
end
