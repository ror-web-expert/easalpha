module Auth
  # A manager types their PIN on the cashier's screen to approve a sensitive action.
  # Returns the approving membership or nil. Both names are saved by the caller in the audit log.
  class PinApproval
    def self.find_approver(pin:, permission:, exclude_membership: nil)
      return nil unless pin.to_s.match?(/\A\d{4}\z/)
      candidates = Membership.active.includes(:role).where.not(pin_digest: nil)
      candidates = candidates.where.not(id: exclude_membership.id) if exclude_membership
      candidates.find { |m| m.can?(permission) && m.authenticate_pin(pin) }
    end
  end
end
