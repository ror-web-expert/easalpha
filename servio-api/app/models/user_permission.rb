# One row per permission granted to one membership (SPEC: permissions are granted per user; presets are shortcuts).
class UserPermission < ApplicationRecord
  include Tenanted
  belongs_to :membership
  validates :permission_code, presence: true, inclusion: { in: Permission.codes }, uniqueness: { scope: :membership_id }
end
