class Supplier < ApplicationRecord
  include Tenanted
  has_many :purchase_orders, dependent: :restrict_with_error
  has_many :goods_receipts, dependent: :restrict_with_error
  has_many :supplier_payments, dependent: :restrict_with_error
  validates :name, presence: true, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :active, -> { where(archived_at: nil) }
  after_create { update_column(:balance_minor, opening_balance_minor) if opening_balance_minor != 0 }

  # Positive balance: we owe the supplier. Negative: the supplier owes us.
  def move_balance!(delta)
    Supplier.where(id: id).update_all(["balance_minor = balance_minor + ?", delta])
    reload
  end
end
