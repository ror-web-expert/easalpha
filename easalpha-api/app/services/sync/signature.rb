module Sync
  # Signed sync records (contract of the final round, 6 Nov 2026). A till's PIN sign-in, and every refresh of it, is
  # answered with sync_key and sync_key_id: the id is the sign-in's first refresh token (RefreshToken#root_id), the
  # key an HMAC of that id under a key derived from secret_key_base, so it is never stored and can always be made
  # again. The till signs every record it queues with the key of the session that made it:
  #   { signed: JSON.stringify({ type, id, membership_id, payload }), signed_by: sync_key_id, sig: base64url(HMAC-SHA256(key, signed)) }
  # A record naming another member than the pushing session's is taken only with that member's signature (Sync::Push).
  module Signature
    # Until then a record with no signature that names another member is still taken under the rule from before the
    # signatures (that member signed in on this till within 60 days), so a queue an older till build left is not
    # stranded; the log tags each one [sync.unsigned].
    SUNSET = Time.utc(2026, 12, 1)
    # A till clock a little ahead still dates a record made just before its session ended inside that session.
    CLOCK_SKEW = 5.minutes

    module_function

    def base_key = @base_key ||= Rails.application.key_generator.generate_key("sync records", 32)

    # The 32 bytes the till signs with, for the sign-in that began with this token id.
    def key_bytes(token_id) = OpenSSL::HMAC.digest("SHA256", base_key, "sync:#{token_id}")

    # sync_key as POST /devices/pin_login and POST /auth/refresh answer it.
    def key_for(token_id) = encode(key_bytes(token_id))

    # What the till sends as sig for these bytes (the specs sign with it too).
    def sign(token_id, body) = encode(OpenSSL::HMAC.digest("SHA256", key_bytes(token_id), body.to_s))

    def matches?(token_id, body, sig)
      given = decode(sig)
      expected = OpenSSL::HMAC.digest("SHA256", key_bytes(token_id), body.to_s)
      given.present? && given.bytesize == expected.bytesize && ActiveSupport::SecurityUtils.secure_compare(given, expected)
    end

    # sync_key and sync_key_id for a POS session's refresh token (raw), or nothing when the token is unknown.
    def fields_for(raw_refresh_token)
      rt = RefreshToken.find_by(token_digest: RefreshToken.digest(raw_refresh_token.to_s))
      rt ? { sync_key: key_for(rt.root_id), sync_key_id: rt.root_id } : {}
    end

    # When the sign-in that began with root_id stopped: its last token revoked (a sign-out, a revoked session, a
    # deactivation) or run out. A rotation revokes a token and issues the next one at the same moment, so the last
    # end of any of them is the session's. Still running: its live token's expiry, which is ahead.
    def session_end(root_id)
      RefreshToken.session_of(root_id).pluck(:revoked_at, :expires_at).map { |revoked, expires| revoked && revoked < expires ? revoked : expires }.max
    end

    # True when that session was running at `at`. A record's time can be older than the sign-in that queued it (an
    # order keeps its cart's start), so only the end bounds it: nothing signed after the session ended counts.
    def session_running_at?(root_id, at)
      ended = session_end(root_id)
      ended.present? && at <= ended + CLOCK_SKEW
    end

    # The record's own time (payload client_created_at), held in Orders::ClientTime's window like the order it dates,
    # without the audit row (applying the record writes that). nil when it carries none, or none that parses: such a
    # record is judged by the time it arrives.
    def made_at(payload)
      raw = payload.respond_to?(:to_h) ? payload.to_h.with_indifferent_access[:client_created_at] : nil
      return nil if raw.blank?
      Time.iso8601(raw.to_s).clamp(Orders::ClientTime::PAST.ago, Orders::ClientTime::FUTURE.from_now)
    rescue ArgumentError
      nil
    end

    def encode(bytes) = Base64.urlsafe_encode64(bytes, padding: false)

    def decode(text)
      Base64.urlsafe_decode64(text.to_s)
    rescue ArgumentError
      nil
    end
  end
end
