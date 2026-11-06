# Mail about a person's own EasAlpha login: a six-digit code (a forgotten password, confirming an email, accepting an
# invitation) and an invitation to join a business. Plain text first, for mail clients that show nothing else.
class AccountMailer < ApplicationMailer
  SUBJECTS = {
    "reset_password" => "Your EasAlpha password reset code",
    "verify_email" => "Confirm your email for EasAlpha",
    "invite" => "Your code to join on EasAlpha"
  }.freeze

  def code(email:, code:, purpose:, name: nil)
    @code = code
    @name = name
    @purpose = purpose
    @minutes = EmailCode::TTL.in_minutes.to_i
    @site = ENV.fetch("PUBLIC_URL", "https://easalpha.com")
    mail(to: email, subject: SUBJECTS.fetch(purpose))
  end

  def invitation(invitation)
    @invitation = invitation
    @business = invitation.business
    @role = invitation.role.name
    @url = invitation.url
    @days = StaffInvitation::TTL.in_days.to_i
    mail(to: invitation.email, subject: "#{@business.name} invited you to EasAlpha")
  end
end
