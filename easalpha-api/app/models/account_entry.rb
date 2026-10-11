class AccountEntry < ApplicationRecord
  include Tenanted
  KINDS = %w[order_payment refund expense supplier_payment customer_payment customer_refund transfer_in transfer_out deposit withdrawal adjustment rider_float opening closing].freeze
  belongs_to :payment_account
  validates :kind, inclusion: { in: KINDS }
  validates :amount_minor, numericality: { only_integer: true }

  # Ledger rows are insert-only. Corrections are reversing rows.
  before_update { raise ActiveRecord::ReadOnlyRecord, "account entries cannot be edited" if changed.any? { |c| !%w[reversed_by_entry_id verified_by_membership_id verified_at updated_at].include?(c) } }
  before_destroy { raise ActiveRecord::ReadOnlyRecord, "account entries cannot be deleted" }
end
