class RefreshToken < ApplicationRecord
  # Two tabs of one till (or of the admin) share a session and may refresh at the same moment. The one that comes second
  # presents the token the first has just spent; within this window it gets the same successor back, not a 401 that
  # signs it out (review R28).
  REPLAY_WINDOW = 30.seconds

  belongs_to :user, optional: true
  belongs_to :membership, optional: true
  belongs_to :device, optional: true
  scope :valid, -> { where(revoked_at: nil).where("expires_at > ?", Time.current) }

  # session_root_id: the first token of the sign-in this one continues (set by rotate!); a sign-in's own token has none.
  def self.issue!(user:, membership: nil, device: nil, app: "admin", ttl: 30.days, user_agent: nil, ip: nil, raw: nil, session_root_id: nil)
    raw ||= SecureRandom.urlsafe_base64(48)
    create!(user: user, membership: membership, device: device, app: app, token_digest: digest(raw), expires_at: ttl.from_now, user_agent: user_agent, ip: ip, session_root_id: session_root_id)
    raw
  end

  def self.find_valid(raw) = valid.find_by(token_digest: digest(raw))
  def self.digest(raw) = Digest::SHA256.hexdigest(raw)

  # The token that replaces `raw` when it is spent: derived from it with the app secret, so a replay can be answered with
  # the same successor although only digests are stored.
  def self.successor_of(raw) = OpenSSL::HMAC.hexdigest("SHA256", Rails.application.secret_key_base, "refresh-rotation:#{raw}")

  # POST /auth/refresh. Spends `raw` and returns [its row, the raw successor], or nil when it cannot be refreshed. A token
  # spent less than REPLAY_WINDOW ago returns its successor again while that one is still valid; a token revoked any other
  # way (logout, a revoked session or device, a deactivated member) has no live successor and stays refused. The row lock
  # makes two refreshes of one token queue up, so the second sees the first one's rotation. `check` runs before anything
  # is spent and may raise to refuse.
  def self.rotate!(raw, user_agent: nil, ip: nil, check: nil)
    transaction do
      rt = lock.find_by(token_digest: digest(raw.to_s))
      successor = successor_of(raw.to_s)
      if rt.nil?
        nil
      elsif rt.revoked_at.nil? && rt.expires_at > Time.current
        check&.call(rt)
        rt.revoke!
        issue!(user: rt.user, membership: rt.membership, device: rt.device, app: rt.app, user_agent: user_agent, ip: ip, raw: successor, session_root_id: rt.root_id)
        [ rt, successor ]
      elsif rt.revoked_at && rt.revoked_at > REPLAY_WINDOW.ago && valid.exists?(token_digest: digest(successor))
        check&.call(rt)
        [ rt, successor ]
      end
    end
  end

  def revoke! = update!(revoked_at: Time.current)

  # The sign-in this token belongs to, through every rotation: its sync key is derived from this id (Sync::Signature).
  def root_id = session_root_id || id

  # Every token of the sign-in that began with root_id: the first one and each successor.
  def self.session_of(root_id) = where(id: root_id).or(where(session_root_id: root_id))
end
