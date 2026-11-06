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

    # Every invitation waiting for this proven phone or email joins `user`; the memberships made.
    def accept_waiting!(user, kind, value) = StaffInvitation.waiting_for(kind, value).map { |inv| inv.accept!(user) }
  end
end
