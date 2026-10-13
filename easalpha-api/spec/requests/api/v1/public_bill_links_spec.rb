require "rails_helper"

# The bill link sent on WhatsApp opens without a login. It stops working once the shop's account is deleted or the
# customer is archived, and it points at this install's own web address.
RSpec.describe "Public bill links", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }
  let(:customer) { within(biz) { Customer.create!(name: "Ali Raza", phone: "+923001112233") } }
  let(:token) { within(biz) { Customers::BillToken.generate(customer, from: today.beginning_of_month, to: today) } }

  def expect_not_working
    [ "/api/v1/public/bills/#{token}", "/api/v1/public/bills/#{token}/pdf" ].each do |path|
      get path
      expect(response).to have_http_status(:not_found)
      expect(json[:error][:code]).to eq("bill.link_invalid")
    end
  end

  it "opens while the shop and the customer are there" do
    get "/api/v1/public/bills/#{token}"
    expect(response).to have_http_status(:ok)
    expect(json[:customer]).to include(name: "Ali Raza")
    # A deactivated customer may still owe money, so the bill still opens.
    within(biz) { customer.update!(status: "deactivated") }
    get "/api/v1/public/bills/#{token}"
    expect(response).to have_http_status(:ok)
  end

  it "stops working once the customer is archived" do
    token
    delete "/api/v1/customers/#{customer.id}", headers: headers
    expect(response).to have_http_status(:no_content)
    expect_not_working
  end

  it "stops working once the business is deleted" do
    token
    biz.update!(status: "deleted")
    expect_not_working
  end

  it "points at PUBLIC_URL, the web address a deploy sets" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("PUBLIC_WEB_URL").and_return(nil)
    allow(ENV).to receive(:[]).with("WEB_URL").and_return(nil)
    allow(ENV).to receive(:[]).with("PUBLIC_URL").and_return("http://192.168.1.20:3000/")
    url = within(biz) { Customers::BillToken.url(customer, from: today.beginning_of_month, to: today) }
    expect(url).to start_with("http://192.168.1.20:3000/bill/")
    get "/api/v1/public/bills/#{url.split('/bill/').last}"
    expect(response).to have_http_status(:ok)
  end
end
