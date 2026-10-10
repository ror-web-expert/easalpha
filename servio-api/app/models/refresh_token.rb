class RefreshToken < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :membership, optional: true
  belongs_to :device, optional: true
  scope :valid, -> { where(revoked_at: nil).where("expires_at > ?", Time.current) }

  def self.issue!(user:, membership: nil, device: nil, app: "admin", ttl: 30.days, user_agent: nil, ip: nil)
    raw = SecureRandom.urlsafe_base64(48)
    create!(user: user, membership: membership, device: device, app: app, token_digest: digest(raw), expires_at: ttl.from_now, user_agent: user_agent, ip: ip)
    raw
  end

  def self.find_valid(raw) = valid.find_by(token_digest: digest(raw))
  def self.digest(raw) = Digest::SHA256.hexdigest(raw)
  def revoke! = update!(revoked_at: Time.current)
end
