require "rails_helper"

# GET /api/v1/health: the deploy check and the till's reachability probe. rls says whether Row-Level Security binds the
# API's database role (6 Nov 2026 review, R9). The specs connect as postgres, a superuser, so here it is false, as in
# production until EASALPHA_APP_DB_PASSWORD is set; spec/lib/rls_spec.rb has the app role's side.
RSpec.describe "Health", type: :request do
  it "answers without a login and says Row-Level Security does not bind a superuser connection" do
    get "/api/v1/health"
    expect(response).to have_http_status(:ok)
    expect(json).to include(status: "ok", version: EasAlpha::VERSION, rls: false)
  end

  it "says true when the connection's role is bound by the policies" do
    allow(EasAlpha::Rls).to receive(:active?).and_return(true)
    get "/api/v1/health"
    expect(json[:rls]).to be(true)
  end
end
