module Auth
  # Who someone is once they have used a code sent to a phone or an email, outside any session (QA of 6 Nov 2026, P1).
  # Holding a phone or email proves that one thing, not the account it happens to sit on: an account that never proved
  # it may have been made by a stranger who typed it, with an email and password of their own.
  module Identity
    module_function

    # [account, state] for a proven `kind` (:phone or :email) of `value`:
    #   :ok        the account holding it proved it before, has no other way in, or `password` is its password: the
    #              prover is the account's holder
    #   :password  the account has another way in the prover has not shown: they give its password, or join anew
    #   :none      no account holds it
    def holder(kind, value, password: nil)
      user = value.present? && User.find_by(kind => value)
      return [ nil, :none ] unless user
      return [ user, :ok ] if user.verified?(kind) || !user.other_way_in_than?(kind)
      return [ user, :ok ] if password.present? && user.password_digest.present? && user.authenticate(password.to_s)
      [ user, :password ]
    end

    # A new login for someone who proved `value`; the account that held it unproven lets it go.
    def new_account!(kind, value, name:)
      User.transaction do
        User.find_by(kind => value)&.release!(kind)
        User.create!(name: name, kind => value, "#{kind}_verified_at": Time.current)
      end
    end

    # The account a code just opened is the prover's: the phone or email is proven, and on a login with no email a
    # password goes. Only its maker knew it (an owner adding staff by phone may type one), and an email added later
    # would make it work for them.
    def claim!(user, kind)
      attrs = {}
      attrs[:"#{kind}_verified_at"] = Time.current unless user.verified?(kind)
      attrs[:password_digest] = nil if kind.to_sym == :phone && user.email.blank? && user.password_digest.present?
      user.update_columns(attrs.merge(updated_at: Time.current)) if attrs.any?
    end

    # Every invitation waiting for this proven phone or email joins `user`; the memberships made.
    def accept_waiting!(user, kind, value) = StaffInvitation.waiting_for(kind, value).map { |inv| inv.accept!(user) }
  end
end
