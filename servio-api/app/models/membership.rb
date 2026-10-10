class Membership < ApplicationRecord
  include Tenanted
  STATUSES = %w[invited active deactivated].freeze
  PIN_LOCK_AFTER = 5

  belongs_to :user
  belongs_to :role
  has_many :refresh_tokens, dependent: :destroy
  has_many :user_permissions, dependent: :destroy
  PERMISSION_MODES = %w[role custom].freeze
  # SPEC staff populations. Riders and employees are also their own records (Rider, Employee).
  STAFF_TYPES = %w[admin cashier order_taker rider].freeze
  CASHIER_ROLES = %w[cashier supervisor kitchen_display].freeze
  validates :staff_type, inclusion: { in: STAFF_TYPES }
  validates :cashier_role, inclusion: { in: CASHIER_ROLES }, allow_nil: true
  before_validation do
    self.staff_type = Membership.staff_type_for(role) if staff_type.blank? && role
    self.cashier_role = (cashier_role.presence || Membership.cashier_role_for(role) || "cashier") if staff_type == "cashier" && role
    self.cashier_role = nil unless staff_type == "cashier"
  end
  scope :of_type, ->(t) { where(staff_type: t) }

  def self.staff_type_for(role)
    { "cashier" => "cashier", "kitchen" => "cashier", "waiter" => "order_taker", "rider" => "rider" }.fetch(role.system_key.to_s, "admin")
  end

  def self.cashier_role_for(role)
    { "cashier" => "cashier", "kitchen" => "kitchen_display" }[role.system_key.to_s]
  end

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
  def custom_permissions? = permissions_mode == "custom"

  # Codes granted before expansion: the role's codes, or this user's own rows in custom mode. Owners hold everything.
  def granted_codes
    r = role || Role.unscoped.find(role_id)
    return Permission.grantable_codes if r.owner?
    custom_permissions? ? UserPermission.unscoped.where(membership_id: id).pluck(:permission_code) : RolePermission.unscoped.where(role_id: r.id).pluck(:permission_code)
  end

  # Effective codes: granted plus implied. A session token may pin this set so a change applies at the next sign-in (SPEC).
  def permission_codes = @permission_codes ||= Permission.expand(granted_codes)
  attr_writer :permission_codes

  def reload(*)
    @permission_codes = nil
    super
  end

  # surface: "software" (desktop POS), "app" (tablet) or nil to ignore the SPEC surface rule.
  def can?(code, surface: nil) = active? && permission_codes.include?(code) && Permission.allowed_on?(code, surface)

  # Replace this user's grants (SPEC per-user permissions). Pass the full list; restriction codes may be included.
  def set_permissions!(codes, granted_by: nil)
    raise ArgumentError, "the owner always holds every permission" if role.owner?
    codes = codes.map(&:to_s).uniq
    invalid = codes - Permission.codes
    raise ArgumentError, "unknown permissions: #{invalid.join(', ')}" if invalid.any?
    transaction do
      user_permissions.delete_all
      now = Time.current
      rows = codes.map { |c| { business_id: business_id, membership_id: id, permission_code: c, granted_at: now, granted_by_user_id: granted_by&.id, created_at: now, updated_at: now } }
      UserPermission.insert_all!(rows) if rows.any?
      update!(permissions_mode: "custom")
    end
    @permission_codes = nil
  end

  def reset_permissions_to_role!
    transaction { user_permissions.delete_all; update!(permissions_mode: "role") }
    @permission_codes = nil
  end
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
