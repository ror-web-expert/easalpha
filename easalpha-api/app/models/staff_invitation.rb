# An owner added someone by a phone or email that is on an EasAlpha account which never proved it (QA of 6 Nov 2026, P1:
# a stranger signed up with a cashier's phone and was linked in her place). Nothing is linked: the person joins when
# they prove the phone (a code by WhatsApp) or the email (a code by email), on the invitation link or by signing in
# with a phone code. What the owner chose (role, branches, staff type, PIN) waits here until then.
class StaffInvitation < ApplicationRecord
  include Tenanted
  TTL = 14.days
  STATUSES = %w[pending accepted cancelled].freeze

  belongs_to :role
  validates :name, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :staff_type, inclusion: { in: Membership::STAFF_TYPES }
  validate { errors.add(:base, "phone or email is required") if phone.blank? && email.blank? }

  scope :pending, -> { where(status: "pending").where("staff_invitations.expires_at > ?", Time.current) }

  def pending? = status == "pending" && expires_at > Time.current
  # The proof the invitee gives: a code to the phone when the owner gave one, else to the email.
  def proof_kind = phone.present? ? :phone : :email
  def proof_value = phone.presence || email

  # The link's token names the invitation and is an HMAC of its id, so it is not stored and the owner can copy the link
  # again; it opens nothing by itself, since accepting needs the code sent to the phone or email.
  # The id and the HMAC run together: a dot would be read as a format by the router.
  def self.token_key = @token_key ||= Rails.application.key_generator.generate_key("easalpha staff invitation", 32)
  def token = "#{id}#{OpenSSL::HMAC.hexdigest('SHA256', StaffInvitation.token_key, id)[0, 32]}"

  def self.find_by_token(raw)
    raw = raw.to_s
    return nil unless raw.match?(/\A[0-9a-f-]{36}[0-9a-f]{32}\z/)
    inv = unscoped.find_by(id: raw[0, 36])
    inv if inv && ActiveSupport::SecurityUtils.secure_compare(inv.token, raw)
  end

  def url = "#{ENV.fetch('PUBLIC_URL', 'https://easalpha.com')}/invite/#{token}"

  # Pending invitations, across businesses, waiting for this phone or email.
  def self.waiting_for(kind, value) = value.blank? ? none : unscoped.pending.where(kind => value)

  # An invitation from the current business, sent: by WhatsApp to the phone (the invitee signs in with a code to that
  # phone, or opens the link), else by email with the link. The PIN waits as a digest, and as the lookup the till finds
  # it by.
  def self.invite!(role:, name:, phone:, email:, staff_type:, cashier_role:, all_branches:, branch_ids:, pin: nil, rider_id: nil, by: Current.membership)
    if unscoped.pending.where(business_id: Current.business_id).where("phone = ? OR email = ?", phone.to_s, email.to_s).exists?
      raise Api::Errors::Conflict.new("staff.invited", "An invitation for this person is already waiting. Resend or cancel it from the list.")
    end
    inv = create!(role: role, name: name, phone: phone, email: email, staff_type: staff_type, cashier_role: cashier_role, all_branches: all_branches,
                  branch_ids: branch_ids, rider_id: rider_id, invited_by_membership_id: by&.id, expires_at: TTL.from_now,
                  pin_digest: pin.presence && BCrypt::Password.create(pin.to_s), pin_lookup: pin.presence && Membership.pin_lookup_for(Current.business_id, pin))
    inv.deliver!
    inv
  end

  def deliver!
    if phone.present?
      Whatsapp::Sender.deliver(phone: phone, template: "staff_invite", variables: { business: business.name, role: role.name })
    elsif ApplicationMailer.enabled?
      AccountMailer.invitation(self).deliver_later
    end
  end

  # The member this invitation becomes, for the account the invitee proved they are. Already a member: that membership.
  def accept!(user)
    Tenancy::Context.with(business, user: user) do
      transaction do
        lock!
        raise Api::Errors::Conflict.new("invitation.closed", "This invitation was cancelled or has expired") unless pending?
        chosen = { role: role, status: "active", deactivated_at: nil, all_branches: all_branches, branch_ids: branch_ids, staff_type: staff_type, cashier_role: cashier_role }
        m = Membership.find_by(user_id: user.id)
        if m.nil? then m = Membership.create!(chosen.merge(user: user, invited_via: proof_kind == :phone ? "whatsapp" : "email"))
        elsif !m.active? # invited back after leaving; a PIN another active member took meanwhile goes (S5)
          m.assign_attributes(pin_digest: nil, pin_lookup: nil) if m.pin_clashes?
          m.update!(chosen)
        end
        # The PIN chosen at invitation time, unless another member took it meanwhile: then the owner sets a new one.
        m.update!(pin_digest: pin_digest, pin_lookup: pin_lookup) if pin_digest && m.pin_digest.blank? && !(pin_lookup && Membership.active.where(pin_lookup: pin_lookup).where.not(id: m.id).exists?)
        link_invited_rider!(m) if rider_id
        Riders::Profile.ensure_for!(m) # the Rider role from Staff had no profile; one invited from Riders is the one linked above
        update!(status: "accepted", accepted_at: Time.current, accepted_by_user_id: user.id, membership_id: m.id)
        AuditLog.record(action: "create", record: m, after: { user_id: user.id, role: role.name, invitation_id: id, accepted: true })
        m
      end
    end
  end

  private

  # The rider made for this invitation becomes the member's, unless the member already rides for this business on a
  # profile of their own (put on the Rider role another way while this waited): that one stays theirs, and the
  # invitation's goes if it carries nothing. Linking it too broke the one-profile-per-login index, a 500 (L2).
  def link_invited_rider!(m)
    own = Rider.where(membership_id: m.id).where.not(id: rider_id).first
    return Rider.where(id: rider_id).update_all(membership_id: m.id) unless own
    spare = Rider.find_by(id: rider_id)
    return unless spare && spare.membership_id.nil? && spare.float_minor.zero? && !spare.deliveries.exists? && !spare.cash_movements.exists?
    spare.update!(active: false, archived_at: Time.current)
  end
end
