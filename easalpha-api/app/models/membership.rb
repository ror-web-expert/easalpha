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
    assign_attributes(pin_digest: BCrypt::Password.create(pin.to_s), pin_lookup: Membership.pin_lookup_for(business_id, pin), pin_failed_count: 0, pin_locked_until: nil)
    pin_lookup_will_change! # the same PIN again gives the same lookup, which still belongs with the new digest
    save!
  end

  # pin_lookup finds a PIN's holder in one indexed query (Auth::PinMatch) where a bcrypt per member took seconds: an
  # HMAC of the business and the PIN under a key derived from secret_key_base, so the column alone gives away nothing
  # a 4-digit PIN would not. Stored as "<key id>:<hmac>": after a secret_key_base change every lookup is from the old
  # key, and those members go back to the bcrypt fallback (which stores a new one) instead of matching nobody.
  def self.pin_lookup_key = @pin_lookup_key ||= Rails.application.key_generator.generate_key("easalpha membership pin lookup", 32)
  def self.pin_lookup_key_id = @pin_lookup_key_id ||= OpenSSL::HMAC.hexdigest("SHA256", pin_lookup_key, "key id")[0, 8]
  def self.pin_lookup_for(business_id, pin) = "#{pin_lookup_key_id}:#{OpenSSL::HMAC.hexdigest('SHA256', pin_lookup_key, "#{business_id}:#{pin}")}"

  # Members with a PIN but no lookup from the current key: set before the column existed, or before a key change.
  scope :pin_lookup_missing, -> { where.not(pin_digest: nil).where("memberships.pin_lookup IS NULL OR memberships.pin_lookup NOT LIKE ?", "#{pin_lookup_key_id}:%") }

  # A digest written any other way than set_pin! drops the lookup it no longer matches; the fallback then finds the member.
  before_save { self.pin_lookup = nil if will_save_change_to_pin_digest? && !will_save_change_to_pin_lookup? }

  # A bcrypt check with no failure counting, for a member the lookup could not name (Auth::PinMatch's fallback). A
  # match stores the lookup, so the next check finds this member by it.
  def pin_matches?(pin)
    return false unless pin_digest.present? && BCrypt::Password.new(pin_digest) == pin.to_s
    store_pin_lookup!(pin)
    true
  end

  def pin_locked? = pin_locked_until.present? && pin_locked_until > Time.current

  # Returns true on success; counts failures and locks after PIN_LOCK_AFTER wrong tries.
  def authenticate_pin(pin)
    return false if pin_digest.blank? || pin_locked? || !active?
    if BCrypt::Password.new(pin_digest) == pin.to_s
      update_columns(pin_failed_count: 0, pin_locked_until: nil) if pin_failed_count.positive?
      store_pin_lookup!(pin)
      true
    else
      n = pin_failed_count + 1
      update_columns(pin_failed_count: n, pin_locked_until: (n >= PIN_LOCK_AFTER ? 15.minutes.from_now : nil))
      false
    end
  end

  # The lazy backfill: housekeeping, so no callbacks, no audit row and no updated_at (that would resend the staff list).
  def store_pin_lookup!(pin)
    value = Membership.pin_lookup_for(business_id, pin)
    update_columns(pin_lookup: value) unless pin_lookup == value
  end

  # Only the live tokens are revoked: a token rotated or signed out earlier keeps the time it ended, which is when
  # that session's signed sync records stop counting (Sync::Signature.session_end).
  def deactivate!
    transaction do
      update!(status: "deactivated", deactivated_at: Time.current)
      refresh_tokens.where(revoked_at: nil).update_all(revoked_at: Time.current)
    end
  end

  def owner? = role.owner?
end
