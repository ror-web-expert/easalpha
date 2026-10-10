class ProductModifierGroup < ApplicationRecord
  include Tenanted
  belongs_to :product
  belongs_to :modifier_group
end
