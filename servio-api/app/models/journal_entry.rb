# SPEC Journal Voucher: a balanced, numbered, insert-only set of debit and credit lines. Manual vouchers are typed by
# a user; automatic ones are written when money or stock moves. Corrections are reversing entries.
class JournalEntry < ApplicationRecord
  include Tenanted
  KINDS = %w[manual auto reversal].freeze
  has_many :lines, class_name: "JournalLine", dependent: :destroy
  belongs_to :reversed_by, class_name: "JournalEntry", optional: true
  validates :kind, inclusion: { in: KINDS }
  before_update { raise ActiveRecord::ReadOnlyRecord, "journal entries cannot be edited" if changed.any? { |c| !%w[reversed_by_id updated_at].include?(c) } }
  before_destroy { raise ActiveRecord::ReadOnlyRecord, "journal entries cannot be deleted" }
  def label = format("JV-%06d", number)
  def debit_minor = lines.sum(&:debit_minor)
  def reversed? = reversed_by_id.present?
end
