module Auth
  # Who a typed PIN belongs to, for a till sign-in, a manager approval or an attendance mark. Every member's PIN is
  # also kept as pin_lookup (Membership.pin_lookup_for), so one indexed query names the holders; checking a bcrypt per
  # member took 2.9 s with twelve staff at cost 12, about 10 s at forty (review of 6 Nov 2026, R3).
  # A PIN set before pin_lookup existed has none yet. Those members are bcrypt-checked as before, but only they, and
  # only when what the lookup found is not enough; a match stores their lookup, so the next check finds them directly.
  # Throttles and lockouts stay with the callers (PinThrottle, pin_locked?): this only answers who holds the PIN.
  module PinMatch
    module_function

    # Members of `among` whose PIN is `pin` and who pass `keep`, lookup matches first. The fallback scan runs unless
    # `enough` is already true of the lookup matches, takes first the members who would be enough on their own, and
    # stops as soon as `enough` holds. A shared PIN gives more than one member; the caller picks.
    def call(pin, among:, keep: ->(_m) { true }, enough: ->(found) { found.any? })
      pin = pin.to_s
      return [] unless pin.match?(/\A\d{4}\z/) && Current.business_id
      found = among.where(pin_lookup: Membership.pin_lookup_for(Current.business_id, pin)).to_a.select { |m| keep.call(m) }
      return found if enough.call(found)
      legacy = among.pin_lookup_missing.to_a.select { |m| keep.call(m) }.partition { |m| enough.call([ m ]) }.flatten
      legacy.each do |m|
        next unless m.pin_matches?(pin)
        found << m
        break if enough.call(found)
      end
      found
    end
  end
end
