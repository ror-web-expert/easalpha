class Notification < ApplicationRecord
  include Tenanted
  scope :unread, -> { where(read_at: nil) }
end
