module Auth
  # A manager types their PIN on the cashier's screen to approve a sensitive action.
  # Returns the approving membership or nil. Both names are saved by the caller in the audit log.
  # Wrong tries count against the member asking (or the device), never against every manager: see Auth::PinThrottle.
  class PinApproval
    def self.find_approver(pin:, permission:, exclude_membership: nil, scope: nil)
      return nil unless pin.to_s.match?(/\A\d{4}\z/)
      scope ||= "member:#{exclude_membership&.id || Current.membership&.id || Current.device&.id || 'anon'}"
      PinThrottle.check!(scope)
      candidates = Membership.active.includes(:role).where.not(pin_digest: nil)
      candidates = candidates.where.not(id: exclude_membership.id) if exclude_membership
      approver = candidates.find { |m| m.can?(permission) && !m.pin_locked? && BCrypt::Password.new(m.pin_digest) == pin.to_s }
      approver ? PinThrottle.clear!(scope) : PinThrottle.failed!(scope)
      approver
    end
  end
end
