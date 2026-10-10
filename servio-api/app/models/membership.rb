class Membership < ApplicationRecord
  include Tenanted
  STATUSES = %w[invited active deactivated].freeze
  PIN_LOCK_AFTER = 5

  belongs_to :user
  belongs_to :role
  has_many :refresh_tokens, dependent: :destroy

  validates :status, inclusion: { in: STATUSES }
  validates :user_id, uniqueness: { scope: :business_id }
  scope :active, -> { where(status: "active") }

  # All active memberships of a user across businesses, with role and business loaded outside any tenant scope.
  def self.all_for_user(user_id)
    ms = Membership.unscoped.where(user_id: user_id, status: "active").order(:created_at).to_a
    roles = Role.unscoped.where(id: ms.map(&:role_id)).index_by(&:id)
    businesses = Business.where(id: ms.map(&:business_id)).index_by(&:id)
    ms.each do |m|
      m.association(:role).target = roles[m.role_id]
      m.association(:business).target = businesses[m.business_id]
    end
    ms
  end

  def active? = status == "active"
  def permission_codes = @permission_codes ||= role.permission_codes
  def can?(code) = active? && permission_codes.include?(code)
  def limit_for(code) = role.limit_for(code)

  def branch_allowed?(branch_id)
    all_branches || branch_ids.include?(branch_id)
  end

  def set_pin!(pin)
    raise ArgumentError, "PIN must be 4 digits" unless pin.to_s.match?(/\A\d{4}\z/)
    update!(pin_digest: BCrypt::Password.create(pin.to_s), pin_failed_count: 0, pin_locked_until: nil)
  end

  def pin_locked? = pin_locked_until.present? && pin_locked_until > Time.current

  # Returns true on success; counts failures and locks after PIN_LOCK_AFTER wrong tries.
  def authenticate_pin(pin)
    return false if pin_digest.blank? || pin_locked? || !active?
    if BCrypt::Password.new(pin_digest) == pin.to_s
      update_columns(pin_failed_count: 0, pin_locked_until: nil) if pin_failed_count.positive?
      true
    else
      n = pin_failed_count + 1
      update_columns(pin_failed_count: n, pin_locked_until: (n >= PIN_LOCK_AFTER ? 15.minutes.from_now : nil))
      false
    end
  end

  def deactivate!
    transaction do
      update!(status: "deactivated", deactivated_at: Time.current)
      refresh_tokens.update_all(revoked_at: Time.current)
    end
  end

  def owner? = role.owner?
end
