class Role < ApplicationRecord
  include Tenanted
  has_many :role_permissions, dependent: :destroy
  has_many :memberships
  validates :name, presence: true, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }
  scope :active, -> { where(archived_at: nil) }

  def permission_codes = role_permissions.pluck(:permission_code)
  def owner? = system_key == "owner"

  def limit_for(code)
    role_permissions.find_by(permission_code: code)&.limit_value
  end

  def copy!(name:)
    Role.transaction do
      copy = Role.create!(business_id: business_id, name: name, copied_from_role_id: id, is_system: false)
      rows = role_permissions.map { |rp| { business_id: business_id, role_id: copy.id, permission_code: rp.permission_code, limit_value: rp.limit_value, created_at: Time.current, updated_at: Time.current } }
      RolePermission.insert_all!(rows) if rows.any?
      copy
    end
  end

  # Replace the permission set. Owner role always keeps every permission.
  def set_permissions!(codes_with_limits)
    raise ArgumentError, "owner role permissions cannot be changed" if owner?
    invalid = codes_with_limits.keys - Permission.codes
    raise ArgumentError, "unknown permissions: #{invalid.join(', ')}" if invalid.any?
    Role.transaction do
      role_permissions.delete_all
      rows = codes_with_limits.map { |code, limit| { business_id: business_id, role_id: id, permission_code: code, limit_value: limit, created_at: Time.current, updated_at: Time.current } }
      RolePermission.insert_all!(rows) if rows.any?
    end
  end
end
