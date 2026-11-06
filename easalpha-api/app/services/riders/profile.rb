module Riders
  # A member on the system Rider role works in the rider app, and the app works on their rider profile: deliveries,
  # float and settlement hang off it. POST /riders makes the login and the profile together; a member put on the role
  # from Staff (added, moved to it, or joining by an invitation) had no profile, so the app answered 403 rider.none and
  # stayed on "loading" (screen walk of 7 Nov 2026). Every way onto the role ends here.
  module Profile
    module_function

    def rider_role?(role) = role&.system_key == "rider"

    # The member's rider, brought back if it was deactivated; else a rider added without a login on the same phone, so
    # their deliveries and float stay theirs; else a new one with the login's name and phone on the member's branch:
    # their one branch, or none (every branch's lists) for a member on all branches or several. Nothing for another role.
    def ensure_for!(membership)
      return unless membership.active? && rider_role?(membership.role)
      rider = Rider.find_by(membership_id: membership.id)
      if rider
        rider.update!(active: true, archived_at: nil) unless rider.active && rider.archived_at.nil?
        return rider
      end
      user = membership.user
      unlinked = user.phone && Rider.active.permanent.where(membership_id: nil).find_by(phone: user.phone)
      return unlinked.tap { |r| r.update!(membership_id: membership.id) } if unlinked
      branches = membership.all_branches ? [] : Array(membership.branch_ids)
      Rider.create!(membership_id: membership.id, name: user.name, phone: user.phone, branch_id: branches.one? ? branches.first : nil)
    end
  end
end
