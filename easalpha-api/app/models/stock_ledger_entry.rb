# Insert-only. A posting is undone by inserting a reversing row; a database trigger blocks UPDATE and DELETE.
class StockLedgerEntry < ApplicationRecord
  include Tenanted
  KINDS = %w[sale sale_return receive transfer_in transfer_out waste adjustment count production_in production_out supplier_return packaging opening].freeze
  IN_KINDS = %w[receive transfer_in production_in sale_return opening].freeze
  OUT_KINDS = %w[transfer_out production_out supplier_return].freeze
  belongs_to :branch
  belongs_to :stock_section
  belongs_to :stock_item
  before_create { self.id ||= SecureRandom.uuid; self.created_at ||= Time.current }
  validates :kind, inclusion: { in: KINDS }

  def readonly? = persisted? && !reversed_by_entry_id_changed?
end
