class CustomerAddress < ApplicationRecord
  include Tenanted
  belongs_to :customer
  validates :line1, presence: true
  after_save { customer.addresses.where.not(id: id).update_all(is_default: false) if is_default }

  def to_s = [ line1, line2, area, city ].compact_blank.join(", ")
end
