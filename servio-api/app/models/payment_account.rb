class PaymentAccount < ApplicationRecord
  include Tenanted
  KINDS = %w[cash wallet bank drawer custom].freeze
  has_many :entries, class_name: "AccountEntry"
  validates :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  scope :active, -> { where(active: true, archived_at: nil) }
  scope :company, -> { where(kind: %w[cash wallet bank custom]) }

  def deactivate!
    raise Api::Errors::Conflict.new("account.has_balance", "#{name} still holds #{current_balance_minor} and cannot be disabled") unless current_balance_minor.zero?
    update!(active: false)
  end

  # Writes one entry and moves the balance in the same transaction. Entries are never edited, only reversed.
  def post!(kind:, amount_minor:, business_day:, ref: nil, description: nil, by: nil, shift_id: nil, occurred_at: Time.current, branch_id: nil, skip_journal: false)
    PaymentAccount.transaction do
      entry = entries.create!(business_id: business_id, branch_id: branch_id || self.branch_id, kind: kind, amount_minor: amount_minor, business_day: business_day,
                              ref_table: ref&.class&.table_name, ref_id: ref&.id, description: description, by_membership_id: by&.id, shift_id: shift_id, occurred_at: occurred_at)
      PaymentAccount.where(id: id).update_all([ "current_balance_minor = current_balance_minor + ?", amount_minor ])
      reload
      Finance::Journal.from_account_entry!(entry) unless skip_journal # SPEC double entry underneath every money move
      entry
    end
  end

  def reverse!(entry, by: nil, description: nil)
    PaymentAccount.transaction do
      rev = post!(kind: entry.kind, amount_minor: -entry.amount_minor, business_day: Date.current, description: description || "Reversal of #{entry.id}", by: by, branch_id: entry.branch_id)
      entry.update!(reversed_by_entry_id: rev.id)
      rev
    end
  end
end
