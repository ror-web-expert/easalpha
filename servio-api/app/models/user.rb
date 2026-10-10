class User < ApplicationRecord
  has_secure_password validations: false
  has_many :memberships, dependent: :destroy
  has_many :businesses, through: :memberships
  has_many :refresh_tokens, dependent: :destroy

  before_validation :normalize_contact
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

  private

  def normalize_contact
    self.email = email.to_s.strip.downcase.presence
    self.phone = User.normalize_phone(phone)
  end

  def email_or_phone_present
    errors.add(:base, "email or phone is required") if email.blank? && phone.blank?
  end
end
