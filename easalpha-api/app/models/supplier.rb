class Supplier < ApplicationRecord
  include Tenanted
  has_many :purchase_orders, dependent: :restrict_with_error
  has_many :goods_receipts, dependent: :restrict_with_error
  has_many :supplier_payments, dependent: :restrict_with_error
  has_many :supplier_adjustments, dependent: :restrict_with_error
  validates :name, presence: true, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :active, -> { where(archived_at: nil) }
  after_create { update_column(:balance_minor, opening_balance_minor) if opening_balance_minor != 0 }
  after_create :post_opening!

  # The opening balance is money owed from before, so it reaches the journal too and Accounts Payable equals the
  # supplier ledgers (QA B10); like every money entry it cannot land on a locked day.
  def post_opening!
    return if opening_balance_minor.to_i.zero?
    branch = Current.branch || Branch.order(:created_at).first
    day = branch.business_day_for(Time.current)
    raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if DayClose.locked?(branch.id, day)
    Finance::Journal.supplier_opening!(self, business_day: day, branch_id: branch.id)
  end

  # Positive balance: we owe the supplier. Negative: the supplier owes us.
  def move_balance!(delta)
    Supplier.where(id: id).update_all([ "balance_minor = balance_minor + ?", delta ])
    reload
  end
end
