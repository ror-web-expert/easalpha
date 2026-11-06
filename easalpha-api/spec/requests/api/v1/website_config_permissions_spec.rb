require "rails_helper"

# QA of 6 Nov 2026, P6: Website Config saved for a manager because the API took menu.edit for everything, and the
# manager's change of the public slug took the storefront offline. The store's identity, address and opening need
# settings.manage; menu.edit keeps the content sections.
RSpec.describe "Website Config permissions", type: :request do
  let!(:owner) { signup_business }
  let(:manager) { add_member!(owner.business, "manager") }

  it "refuses a manager the slug, publishing, identity and opening, and takes the content sections" do
    h = auth_headers(manager)
    api_patch "/api/v1/website_config", { slug: "taken-over" }, headers: h
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:message]).to include("settings.manage")
    api_patch "/api/v1/website_config", { published: false }, headers: h
    expect(response).to have_http_status(:forbidden)
    api_patch "/api/v1/website_config", { sections: { identity: { name: "Other name" } } }, headers: h
    expect(response).to have_http_status(:forbidden)
    api_patch "/api/v1/website_config", { sections: { system: { maintenance: true } } }, headers: h
    expect(response).to have_http_status(:forbidden)
    api_patch "/api/v1/website_config", { sections: { seo: { title: "Best karahi" } } }, headers: h
    expect(response).to have_http_status(:ok)
    get "/api/v1/website_config", headers: h
    expect(json[:slug]).to eq(owner.business.slug)
  end

  it "lets the owner change the slug" do
    api_patch "/api/v1/website_config", { slug: "new-address" }, headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    expect(json[:slug]).to eq("new-address")
  end
end
