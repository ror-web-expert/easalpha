require "rails_helper"

RSpec.describe "Urdu error messages", type: :request do
  let!(:owner) { signup_business }

  it "returns Urdu messages for known codes when the client asks for ur, and English otherwise" do
    get "/api/v1/me"
    expect(json[:error][:message]).to eq("Login required")
    get "/api/v1/me", headers: { "Accept-Language" => "ur-PK,ur;q=0.9" }
    expect(json[:error][:code]).to eq("unauthorized")
    expect(json[:error][:message]).to eq("لاگ ان درکار ہے")
    get "/api/v1/orders/00000000-0000-0000-0000-000000000000", headers: auth_headers(owner).merge("X-Locale" => "ur")
    expect(json[:error][:message]).to eq("نہیں ملا")
    get "/api/v1/qr/nope", headers: { "Accept-Language" => "ur" }
    expect(json[:error][:message]).to eq("یہ میز کا کارڈ درست نہیں")
  end
end
