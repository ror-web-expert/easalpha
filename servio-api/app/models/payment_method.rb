class PaymentMethod < ApplicationRecord
  include Tenanted
  KINDS = %w[cash card wallet bank khata qr custom].freeze
  belongs_to :payment_account, optional: true
  validates :code, :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :code, uniqueness: { scope: :business_id }
  scope :active, -> { where(active: true) }

  DEFAULTS = [
    { code: "cash", name: "Cash", kind: "cash", works_offline: true, account: { name: "Cash", kind: "cash", is_default: true } },
    { code: "card", name: "Card", kind: "card", works_offline: true, needs_reference: true, account: { name: "Card settlements", kind: "bank" } },
    { code: "easypaisa", name: "EasyPaisa", kind: "wallet", needs_reference: true, account: { name: "EasyPaisa", kind: "wallet" } },
    { code: "jazzcash", name: "JazzCash", kind: "wallet", needs_reference: true, account: { name: "JazzCash", kind: "wallet" } },
    { code: "bank", name: "Bank transfer", kind: "bank", needs_reference: true, account: { name: "Bank", kind: "bank" } },
    { code: "raast", name: "Raast QR", kind: "qr", needs_reference: true, account: { name: "Bank", kind: "bank" } },
    { code: "khata", name: "Khata (account)", kind: "khata", works_offline: true, account: nil }
  ].freeze

  def self.seed_defaults!(business)
    accounts = {}
    DEFAULTS.each_with_index do |d, i|
      account = nil
      if d[:account]
        account = accounts[d[:account][:name]] ||= PaymentAccount.find_by(business_id: business.id, name: d[:account][:name]) || PaymentAccount.create!(business: business, name: d[:account][:name], kind: d[:account][:kind], is_default: d[:account][:is_default] || false)
      end
      find_or_create_by!(business: business, code: d[:code]) { |m| m.assign_attributes(name: d[:name], kind: d[:kind], works_offline: d[:works_offline] || false, needs_reference: d[:needs_reference] || false, payment_account: account, sort_order: i) }
    end
  end

  def cash? = kind == "cash"
  def khata? = kind == "khata"
end
