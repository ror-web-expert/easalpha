require "rails_helper"

# QA of 6 Nov 2026, P8: there was no way back into a login with a forgotten password but a phone code. A code by email
# resets it: the same answer whether or not the email has a login, a short-lived code with five tries, at most five
# codes an hour, a mail with a plain-text body.
RSpec.describe "Password reset by email code", type: :request do
  let!(:owner) { signup_business(email: "forgot@example.com") }

  def forgot(email)
    api_post "/api/v1/auth/password/forgot", { email: email }
    response.status
  end

  it "answers the same for an email with a login and one without, and mails a code only to the first" do
    clear_enqueued_jobs
    expect(forgot("forgot@example.com")).to eq(200)
    with_login = json.except(:dev_code)
    expect(forgot("nobody@example.com")).to eq(200)
    expect(json.except(:dev_code)).to eq(with_login)
    mails = enqueued_jobs.select { |j| j["job_class"] == "ActionMailer::MailDeliveryJob" && j["arguments"].first == "AccountMailer" }
    expect(mails.size).to eq(1)
  end

  it "sets the new password with the code, signs every session out, confirms the email, and leaves a phone unproven" do
    owner.user.update!(phone: "+923339990001", phone_verified_at: Time.current)
    api_post "/api/v1/auth/login", { email: "forgot@example.com", password: "password123" }
    old_refresh = json[:refresh_token]
    forgot("forgot@example.com")
    code = json[:dev_code]
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: "999999", password: "brand-new-pass" }
    expect(response).to have_http_status(:unauthorized)
    api_post "/api/v1/auth/password/reset", { email: "FORGOT@example.com", code: code, password: "brand-new-pass" }
    expect(response).to have_http_status(:ok)
    # The email was not proven before: the phone, proven or not, may be someone else's, so it confirms again (with this
    # password, at the next phone login) before it links or opens anything.
    expect(owner.user.reload).to have_attributes(phone: "+923339990001", phone_verified_at: nil, email_verified_at: be_present)
    expect(owner.user.authenticate("brand-new-pass")).to be_truthy
    api_post "/api/v1/auth/refresh", { refresh_token: old_refresh }
    expect(response).to have_http_status(:unauthorized)
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: code, password: "again-new-pass" }
    expect(response).to have_http_status(:unauthorized) # one use
  end

  it "keeps a proven phone on a login whose email was proven, refuses a short password without using the code, and lets a code expire" do
    owner.user.update!(phone: "+923339990002", phone_verified_at: Time.current, email_verified_at: Time.current)
    forgot("forgot@example.com")
    code = json[:dev_code]
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: code, password: "short" }
    expect(response).to have_http_status(:unprocessable_content)
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: code, password: "long-enough-1" }
    expect(response).to have_http_status(:ok)
    expect(owner.user.reload).to have_attributes(phone: "+923339990002", phone_verified_at: be_present)
    forgot("forgot@example.com")
    travel 16.minutes
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: json[:dev_code], password: "long-enough-2" }
    expect(response).to have_http_status(:unauthorized)
  end

  it "stops a code after five wrong tries, and makes at most five codes an hour" do
    forgot("forgot@example.com")
    code = json[:dev_code]
    5.times { api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: "000000", password: "long-enough-1" } }
    api_post "/api/v1/auth/password/reset", { email: "forgot@example.com", code: code, password: "long-enough-1" }
    expect(response).to have_http_status(:unauthorized)
    4.times { forgot("forgot@example.com") }
    expect(EmailCode.where(email: "forgot@example.com").count).to eq(5)
    expect(forgot("forgot@example.com")).to eq(200) # the same answer, no sixth code
    expect(EmailCode.where(email: "forgot@example.com").count).to eq(5)
  end
end
