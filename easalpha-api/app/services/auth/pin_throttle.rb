module Auth
  # Wrong PINs are counted where they were typed: per till for a sign-in, per acting member for a manager approval.
  # A PIN login names nobody, so counting a wrong try against every member who has a PIN (as before) let five wrong
  # tries on one till lock the whole staff out for fifteen minutes. The count lives in the cache and expires on its own.
  module PinThrottle
    LIMIT = 5
    LOCK = 15.minutes

    module_function

    def locked?(scope) = Rails.cache.read(key(scope)).to_i >= LIMIT

    # Raises pin.locked once the scope has used up its tries.
    def check!(scope)
      raise Api::Errors::Unauthorized.new("pin.locked", "Too many wrong PINs. Try again in 15 minutes.") if locked?(scope)
    end

    def failed!(scope)
      k = key(scope)
      Rails.cache.increment(k, 1, expires_in: LOCK) || Rails.cache.write(k, 1, expires_in: LOCK)
    end

    def clear!(scope) = Rails.cache.delete(key(scope))

    def key(scope) = "pin_fail:#{scope}"
  end
end
