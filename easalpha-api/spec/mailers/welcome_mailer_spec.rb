require "rails_helper"

RSpec.describe WelcomeMailer do
  it "welcomes the owner with the login link, the trial end and the first steps" do
    owner = signup_business(name: "Mail Cafe")
    mail = described_class.signup(user: owner.user, business: owner.business)
    expect(mail.to).to eq([ owner.user.email ])
    expect(mail.subject).to include("Mail Cafe")
    expect(mail.text_part.body.to_s).to include("/login").and include(owner.business.trial_ends_on.strftime("%-d %B %Y")).and include("Add your menu")
    expect(mail.html_part.body.to_s).to include("/download")
  end

  it "is queued by signup when mail is enabled" do
    expect { Auth::Signup.call(name: "Sara", business_name: "Queue Cafe", email: "sara@example.com", password: "password123") }
      .to have_enqueued_mail(WelcomeMailer, :signup)
  end
end
