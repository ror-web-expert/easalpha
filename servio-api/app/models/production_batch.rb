class ProductionBatch < ApplicationRecord
  include Tenanted
  belongs_to :branch
  belongs_to :recipe
  belongs_to :stock_document, optional: true
  belongs_to :stock_section, optional: true
  validates :quantity_produced, numericality: { greater_than: 0 }
end
