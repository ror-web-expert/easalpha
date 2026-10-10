class RolePermission < ApplicationRecord
  include Tenanted
  belongs_to :role
  validates :permission_code, presence: true, inclusion: { in: Permission.codes }
end
