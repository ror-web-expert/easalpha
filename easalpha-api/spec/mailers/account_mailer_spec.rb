require "rails_helper"

RSpec.describe AccountMailer do
  it "sends a reset code with a plain-text body that says how long it works" do
    mail = described_class.code(email: "forgot@example.com", code: "482913", purpose: "reset_password", name: "Sara")
    expect(mail.to).to eq([ "forgot@example.com" ])
    expect(mail.subject).to eq("Your EasAlpha password reset code")
    expect(mail.text_part.body.to_s).to include("Hello Sara", "482913", "15 minutes", "ignore this email")
    expect(mail.html_part.body.to_s).to include("482913")
  end

  it "invites by email with the link, the business and the role" do
    owner = signup_business(name: "Invite Cafe")
    inv = Tenancy::Context.with(owner.business) do
      StaffInvitation.create!(role: Role.find_by!(system_key: "accountant"), name: "Nida", email: "nida@example.com", staff_type: "admin", expires_at: 14.days.from_now)
    end
    mail = described_class.invitation(inv)
    expect(mail.to).to eq([ "nida@example.com" ])
    expect(mail.subject).to include("Invite Cafe")
    expect(mail.text_part.body.to_s).to include("Accountant", "/invite/#{inv.token}", "14 days")
  end
end
