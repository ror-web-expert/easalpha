require "rails_helper"

RSpec.describe "Super admin", type: :request do
  let!(:owner) { signup_business }
  let(:admin) { create(:super_admin) }
  let(:super_headers) do
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    { "Authorization" => "Bearer #{json[:access_token]}" }
  end

  it "lists businesses with stats, changes a business status, and reports health" do
    get "/api/v1/super/businesses", headers: super_headers
    expect(response).to have_http_status(:ok)
    expect(json[:data].first[:members]).to eq(1)
    get "/api/v1/super/stats", headers: super_headers
    expect(json[:businesses][:trial]).to be >= 1
    api_patch "/api/v1/super/businesses/#{owner.business_id}", { status: "active" }, headers: super_headers
    expect(json[:status]).to eq("active")
    get "/api/v1/super/health", headers: super_headers
    expect(json[:status]).to eq("ok")
    expect(json[:businesses]).to be >= 1
  end

  it "manages feature flags globally and per business" do
    api_put "/api/v1/super/feature_flags", { key: "kitchen_v2", enabled: true }, headers: super_headers
    expect(json[:enabled]).to be true
    api_put "/api/v1/super/feature_flags", { key: "kitchen_v2", enabled: false, business_id: owner.business_id }, headers: super_headers
    expect(FeatureFlag.enabled?("kitchen_v2", business: owner.business)).to be false
    other = signup_business(name: "Other")
    expect(FeatureFlag.enabled?("kitchen_v2", business: other.business)).to be true
    get "/api/v1/super/feature_flags", headers: super_headers
    expect(json[:data].size).to eq(2)
  end

  it "rejects super endpoints without a super token" do
    get "/api/v1/super/businesses", headers: auth_headers(owner)
    expect(response).to have_http_status(:unauthorized)
    api_post "/api/v1/super/login", { email: "nobody@servio.com", password: "x" }
    expect(response).to have_http_status(:unauthorized)
  end
end
