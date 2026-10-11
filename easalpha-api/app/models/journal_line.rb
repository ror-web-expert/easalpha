class JournalLine < ApplicationRecord
  include Tenanted
  belongs_to :journal_entry
  belongs_to :gl_account
  validates :debit_minor, :credit_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  validate { errors.add(:base, "a line is either a debit or a credit") if debit_minor.positive? && credit_minor.positive? }
  validate { errors.add(:base, "a line needs an amount") if debit_minor.zero? && credit_minor.zero? }
  before_update { raise ActiveRecord::ReadOnlyRecord, "journal lines cannot be edited" }
  before_destroy { raise ActiveRecord::ReadOnlyRecord, "journal lines cannot be deleted" unless destroyed_by_association }
end
