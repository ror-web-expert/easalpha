class OtpCode < ApplicationRecord
  TTL = 10.minutes
  MAX_ATTEMPTS = 5
  # invite: accepting a staff invitation sent to this phone (StaffInvitation).
  PURPOSES = %w[login signup verify_phone invite].freeze

  def self.issue!(phone:, purpose: "login")
    code = Rails.env.production? ? format("%06d", SecureRandom.random_number(1_000_000)) : "123456"
    where(phone: phone, purpose: purpose, consumed_at: nil).update_all(consumed_at: Time.current)
    record = create!(phone: phone, purpose: purpose, code_digest: BCrypt::Password.create(code), expires_at: TTL.from_now)
    [ record, code ]
  end

  # The live code for this phone and purpose when `code` matches it, not yet used up: the caller calls consume! once
  # everything else holds, so a step that asks for more (an account's password) can be answered with the same code. A
  # wrong code counts against its attempts.
  def self.check(phone:, purpose: "login", code:)
    record = where(phone: phone, purpose: purpose, consumed_at: nil).where("expires_at > ?", Time.current).order(created_at: :desc).first
    return nil unless record && record.attempts < MAX_ATTEMPTS
    return record if BCrypt::Password.new(record.code_digest) == code.to_s
    record.increment!(:attempts)
    nil
  end

  def self.verify!(phone:, purpose: "login", code:)
    record = check(phone: phone, purpose: purpose, code: code)
    record ? record.consume! : false
  end

  def consume! = update!(consumed_at: Time.current) && true
  # A right code with a wrong password still spends a try, so the password cannot be guessed through the code.
  def fail! = increment!(:attempts)
end
