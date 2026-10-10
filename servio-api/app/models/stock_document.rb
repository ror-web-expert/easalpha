class StockDocument < ApplicationRecord
  include Tenanted
  # SPEC Stock Actions register: eight types, five statuses, numbered like GRN-000023.
  KINDS = %w[receive po_receipt transfer waste adjustment count opening_balance production supplier_return].freeze
  STATUSES = %w[draft awaiting_approval in_transit posted voided cancelled].freeze
  PREFIX = { "receive" => "GRN", "po_receipt" => "POR", "transfer" => "TRF", "waste" => "WST", "adjustment" => "ADJ", "count" => "CNT", "opening_balance" => "OPB", "production" => "PRD", "supplier_return" => "RET" }.freeze
  belongs_to :branch
  belongs_to :from_section, class_name: "StockSection", optional: true
  belongs_to :to_section, class_name: "StockSection", optional: true
  has_many :lines, class_name: "StockDocumentLine", dependent: :destroy
  has_many :ledger_entries, class_name: "StockLedgerEntry", foreign_key: :ref_id
  before_create { self.id ||= SecureRandom.uuid }
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :reason, presence: true, if: -> { kind == "waste" }
  validate :sections_for_kind

  def label = "#{PREFIX[kind]}-#{number.to_s.rjust(6, '0')}"
  def draft? = status == "draft"
  def awaiting_approval? = status == "awaiting_approval"
  def in_transit? = status == "in_transit"
  def posted? = status == "posted"
  def voided? = status.in?(%w[voided cancelled])

  private

  def sections_for_kind
    case kind
    when "receive", "po_receipt", "opening_balance", "production" then errors.add(:to_section, "is required") unless to_section_id
    when "waste", "supplier_return", "adjustment", "count" then errors.add(:from_section, "is required") unless from_section_id
    when "transfer"
      errors.add(:from_section, "is required") unless from_section_id
      errors.add(:to_section, "is required") unless to_section_id
      errors.add(:to_section, "must differ from the source") if from_section_id && from_section_id == to_section_id
    end
  end
end
