class WhatsappMessage < ApplicationRecord
  # Not Tenanted: OTP messages belong to no business. Business queries filter explicitly.
  STATUSES = %w[queued logged sent delivered read failed].freeze
  validates :to_phone, :template_name, presence: true
  validates :status, inclusion: { in: STATUSES }
end
