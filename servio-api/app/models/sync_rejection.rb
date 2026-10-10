class SyncRejection < ApplicationRecord
  include Tenanted
  scope :open, -> { where(resolved_at: nil) }
end
