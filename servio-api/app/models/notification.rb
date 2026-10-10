class Notification < ApplicationRecord
  include Tenanted
  scope :unread, -> { where(read_at: nil) }
  after_create_commit { Push::Notifier.from_notification(self) } # browser push to the people who should see it
end
