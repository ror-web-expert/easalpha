# A six-digit code sent by email, as OtpCode is for phones: resetting a forgotten password, confirming an email on /me,
# accepting a staff invitation sent to the email. Short-lived, five tries, the digest only (QA of 6 Nov 2026, P1, P8).
class EmailCode < ApplicationRecord
  TTL = 15.minutes
  MAX_ATTEMPTS = 5
  # At most this many codes an hour for one email and purpose, so the inbox cannot be flooded through the API.
  HOURLY_LIMIT = 5
  PURPOSES = %w[reset_password verify_email invite].freeze

  validates :purpose, inclusion: { in: PURPOSES }

  def self.normalize(email) = email.to_s.strip.downcase.presence

  # [record, code], or nil when this email has had HOURLY_LIMIT codes for the purpose in the last hour.
  def self.issue!(email:, purpose:)
    email = normalize(email)
    return nil if where(email: email, purpose: purpose).where("created_at > ?", 1.hour.ago).count >= HOURLY_LIMIT
    code = Rails.env.production? ? format("%06d", SecureRandom.random_number(1_000_000)) : "123456"
    where(email: email, purpose: purpose, consumed_at: nil).update_all(consumed_at: Time.current)
    [ create!(email: email, purpose: purpose, code_digest: BCrypt::Password.create(code), expires_at: TTL.from_now), code ]
  end

  def self.check(email:, purpose:, code:)
    record = where(email: normalize(email), purpose: purpose, consumed_at: nil).where("expires_at > ?", Time.current).order(created_at: :desc).first
    return nil unless record && record.attempts < MAX_ATTEMPTS
    return record if BCrypt::Password.new(record.code_digest) == code.to_s
    record.increment!(:attempts)
    nil
  end

  def consume! = update!(consumed_at: Time.current) && true
  def fail! = increment!(:attempts)
end
