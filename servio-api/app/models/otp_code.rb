class OtpCode < ApplicationRecord
  TTL = 10.minutes
  MAX_ATTEMPTS = 5

  def self.issue!(phone:, purpose: "login")
    code = Rails.env.production? ? format("%06d", SecureRandom.random_number(1_000_000)) : "123456"
    where(phone: phone, purpose: purpose, consumed_at: nil).update_all(consumed_at: Time.current)
    record = create!(phone: phone, purpose: purpose, code_digest: BCrypt::Password.create(code), expires_at: TTL.from_now)
    [record, code]
  end

  def self.verify!(phone:, purpose: "login", code:)
    record = where(phone: phone, purpose: purpose, consumed_at: nil).where("expires_at > ?", Time.current).order(created_at: :desc).first
    return false unless record && record.attempts < MAX_ATTEMPTS
    if BCrypt::Password.new(record.code_digest) == code.to_s
      record.update!(consumed_at: Time.current)
      true
    else
      record.increment!(:attempts)
      false
    end
  end
end
