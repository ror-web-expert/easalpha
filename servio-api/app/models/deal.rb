class Deal < ApplicationRecord
  include Tenanted
  belongs_to :tax_rate, optional: true
  has_many :deal_items, dependent: :destroy
  validates :name, presence: true
  validates :price_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  scope :active, -> { where(archived_at: nil, active: true) }

  def available_at?(time)
    (valid_from.nil? || time >= valid_from) && (valid_to.nil? || time <= valid_to)
  end
end
