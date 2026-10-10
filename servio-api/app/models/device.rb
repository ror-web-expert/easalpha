class Device < ApplicationRecord
  include Tenanted
  KINDS = %w[till tablet kitchen customer_display token_screen kiosk].freeze
  belongs_to :branch
  validates :name, :code, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :code, uniqueness: { scope: [:business_id, :branch_id] }
  scope :active, -> { where(revoked_at: nil) }

  before_validation { self.code ||= next_code }

  def next_code
    prefix = { "till" => "T", "tablet" => "W", "kitchen" => "K", "customer_display" => "C", "token_screen" => "S", "kiosk" => "Q" }[kind] || "D"
    n = Device.where(branch_id: branch_id, kind: kind).count + 1
    "#{prefix}#{n}"
  end

  def issue_pairing_code!
    code = format("%06d", SecureRandom.random_number(1_000_000))
    update!(pairing_code: code, pairing_expires_at: 15.minutes.from_now)
    code
  end

  def paired? = paired_at.present? && revoked_at.nil?
  def revoke! = update!(revoked_at: Time.current, token_digest: nil, pairing_code: nil)
end
