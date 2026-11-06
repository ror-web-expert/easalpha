module Auth
  # A manager types their PIN on the cashier's screen to approve a sensitive action.
  # Returns the approving membership or nil. Both names are saved by the caller in the audit log.
  # Wrong tries count against the member asking (or the device), never against every manager: see Auth::PinThrottle.
  # The holder is found by the PIN lookup (Auth::PinMatch), not by a bcrypt per member.
  class PinApproval
    def self.find_approver(pin:, permission:, exclude_membership: nil, scope: nil)
      return nil unless pin.to_s.match?(/\A\d{4}\z/)
      scope ||= "member:#{exclude_membership&.id || Current.membership&.id || Current.device&.id || 'anon'}"
      PinThrottle.check!(scope)
      candidates = Membership.active.includes(:role)
      candidates = candidates.where.not(id: exclude_membership.id) if exclude_membership
      approver = PinMatch.call(pin, among: candidates, keep: ->(m) { m.can?(permission) && !m.pin_locked? }).first
      approver ? PinThrottle.clear!(scope) : PinThrottle.failed!(scope)
      approver
    end

    # One PIN approving several steps (a queued record's approval_codes): each permission goes to a holder of the
    # PIN who has it, as find_approver does for one. Nothing stops two staff sharing a PIN, so the first holder found
    # (a waiter who joined first) is not the approver of everything (final round, sync-auth#7). permissions: nil, a
    # PIN from a till before approval codes, approves everything its holders hold. Returns { code => membership }.
    def self.approvals_for(pin:, permissions:, exclude_membership:, needs: "app.pos")
      return {} unless pin.to_s.match?(/\A\d{4}\z/)
      scope = "member:#{exclude_membership.id}"
      PinThrottle.check!(scope)
      candidates = Membership.active.includes(:role).where.not(id: exclude_membership.id)
      covered = ->(found) { permissions ? permissions.all? { |c| found.any? { |m| m.can?(c) } } : found.any? }
      holders = PinMatch.call(pin, among: candidates, keep: ->(m) { m.can?(needs) && !m.pin_locked? }, enough: covered)
      holders.any? ? PinThrottle.clear!(scope) : PinThrottle.failed!(scope)
      (permissions || holders.flat_map(&:permission_codes).uniq).each_with_object({}) do |code, granted|
        approver = holders.find { |m| m.can?(code) }
        granted[code] = approver if approver
      end
    end
  end
end
