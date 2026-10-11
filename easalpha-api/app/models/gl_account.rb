# SPEC double entry: one row of the chart of accounts. System rows ship with every business and cannot be removed or
# have their code, kind or side changed; users add their own beneath them.
class GlAccount < ApplicationRecord
  include Tenanted
  KINDS = %w[asset liability equity income expense].freeze
  SIDES = %w[debit credit].freeze
  belongs_to :parent, class_name: "GlAccount", optional: true
  belongs_to :payment_account, optional: true
  has_many :children, class_name: "GlAccount", foreign_key: :parent_id
  has_many :journal_lines
  validates :code, :name, presence: true
  validates :code, uniqueness: { scope: :business_id }
  validates :kind, inclusion: { in: KINDS }
  validates :normal_side, inclusion: { in: SIDES }
  before_validation { self.normal_side ||= %w[asset expense].include?(kind) ? "debit" : "credit" }
  before_update { raise Api::Errors::Conflict.new("gl_account.system", "#{code} #{name} is a system account") if is_system && (code_changed? || kind_changed? || normal_side_changed? || archived_at_changed?) }
  before_destroy { raise Api::Errors::Conflict.new("gl_account.system", "#{code} #{name} is a system account") if is_system }
  scope :active, -> { where(archived_at: nil) }
  scope :posting, -> { active.where(is_header: false) }

  # Balance on the account's normal side: debits minus credits for debit accounts, the reverse for credit accounts.
  def self.signed(kind_or_side, debit, credit)
    side = SIDES.include?(kind_or_side.to_s) ? kind_or_side.to_s : (%w[asset expense].include?(kind_or_side.to_s) ? "debit" : "credit")
    side == "debit" ? debit - credit : credit - debit
  end
end
