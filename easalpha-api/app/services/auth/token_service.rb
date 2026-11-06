module Auth
  class TokenService
    ACCESS_TTL = 15.minutes
    DEVICE_TTL = 365.days
    ALGO = "HS256"

    class << self
      def secret = Rails.application.secret_key_base

      def encode(claims, ttl:)
        now = Time.current.to_i
        JWT.encode(claims.merge(iat: now, exp: now + ttl.to_i, jti: SecureRandom.uuid), secret, ALGO)
      end

      def decode(token)
        payload, = JWT.decode(token, secret, true, algorithm: ALGO)
        payload.with_indifferent_access
      rescue JWT::DecodeError, JWT::ExpiredSignature
        nil
      end

      # Session token for a person working in a business.
      def access_token(user:, membership:, app:, device: nil, branch: nil)
        # perms: the granted set at sign-in, so a permission change takes effect at the next sign-in or refresh (SPEC).
        encode({ typ: "access", sub: user.id, mid: membership.id, bid: membership.business_id, brid: branch&.id, did: device&.id, app: app, perms: membership.permission_codes }, ttl: ACCESS_TTL)
      end

      # EasAlpha support working in a business on an approved session, as its owner's membership: marked (sup, sa) so the
      # API refuses sign-in, staff and billing changes and the audit log names the support person, and it lasts exactly
      # as long as the session. It used to be a plain owner token (QA of 6 Nov 2026, P3).
      def support_token(support_session:, membership:)
        ttl = [ support_session.expires_at - Time.current, 0 ].max
        encode({ typ: "access", sub: membership.user_id, mid: membership.id, bid: membership.business_id, app: "admin", perms: membership.permission_codes,
                 sup: support_session.id, sa: support_session.super_admin_id }, ttl: ttl)
      end

      # Long-lived token identifying a paired device before anyone logs in with a PIN.
      def device_token(device)
        encode({ typ: "device", did: device.id, bid: device.business_id, brid: device.branch_id, app: "pos" }, ttl: DEVICE_TTL)
      end

      def super_token(super_admin)
        encode({ typ: "super", sub: super_admin.id }, ttl: 8.hours)
      end
    end
  end
end
