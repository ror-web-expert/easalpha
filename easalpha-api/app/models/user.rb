class User < ApplicationRecord
  has_secure_password validations: false
  has_many :memberships, dependent: :destroy
  has_many :businesses, through: :memberships
  has_many :refresh_tokens, dependent: :destroy

  before_validation :normalize_contact
  before_save :forget_unproven_contact
  validates :name, presence: true
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, allow_nil: true
  validates :phone, format: { with: /\A\+[1-9]\d{7,14}\z/, message: "must be in international format (+92...)" }, allow_nil: true
  validate :email_or_phone_present
  validates :password, length: { minimum: 8 }, allow_nil: true

  def self.normalize_phone(raw)
    s = raw.to_s.gsub(/[\s\-()]/, "")
    return nil if s.blank?
    s = "+92#{s[1..]}" if s.start_with?("0") && s.length == 11
    s = "+#{s}" if s.match?(/\A92\d{10}\z/)
    s
  end

  # A phone or email is proven once its holder used a code sent to it (QA of 6 Nov 2026, P1). Only a proven one links
  # this account into a business that adds the person by it: anyone can type a phone or email at sign-up, and owners
  # type them when they add staff.
  def verified?(kind) = kind.to_sym == :phone ? phone.present? && phone_verified_at.present? : email.present? && email_verified_at.present?

  def verify!(kind) = update!(kind.to_sym == :phone ? { phone_verified_at: Time.current } : { email_verified_at: Time.current })

  # Whether anyone but the holder of this account's `kind` (:phone or :email) can sign in to it: an email can get a
  # password reset by email and signs in with a password; a phone signs in with a code. An account whose only way in
  # is a phone belongs to whoever holds that phone, proven or not (a till cashier an owner added by phone).
  def other_way_in_than?(kind) = kind.to_sym == :phone ? email.present? : phone.present? || password_digest.present?

  # The phone or email goes from this account, which never proved it, to the person who just did. The account keeps
  # its memberships and anything else it signs in with.
  def release!(kind)
    raise ArgumentError, "a proven #{kind} is not released" if verified?(kind)
    update_columns(kind.to_sym => nil, updated_at: Time.current)
  end

  private

  # A new phone or email starts unproven, unless the save that sets it is the proof.
  def forget_unproven_contact
    self.phone_verified_at = nil if will_save_change_to_phone? && !will_save_change_to_phone_verified_at?
    self.email_verified_at = nil if will_save_change_to_email? && !will_save_change_to_email_verified_at?
  end

  def normalize_contact
    self.email = email.to_s.strip.downcase.presence
    self.phone = User.normalize_phone(phone)
  end

  def email_or_phone_present
    errors.add(:base, "email or phone is required") if email.blank? && phone.blank?
  end
end
