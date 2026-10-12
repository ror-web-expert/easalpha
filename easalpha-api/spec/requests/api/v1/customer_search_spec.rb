require "rails_helper"

# The till's customer search (12 Oct 2026): one box for a name or a number. Students are found by name, roll no.,
# room, khata no., their own phone or the guardian's, with or without the leading 0, 92 or +92.
RSpec.describe "Customer search", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  let!(:ali) { within(biz) { Customer.create!(name: "Ali Raza", phone: "03001112233", member_no: "R-12", room: "C-7", guardian_name: "Raza Khan", guardian_phone: "03119998877") } }
  let!(:hamza) { within(biz) { Customer.create!(name: "Hamza Raza", member_no: "R-13", room: "C-7", guardian_phone: "03119998877") } }
  let!(:ahmed) { within(biz) { Customer.create!(name: "Ahmed Butt", phone: "03211234567", room: "D-2") } }

  def search(q, h = headers)
    get "/api/v1/customers/search", params: { q: q }, headers: h
    expect(response).to have_http_status(:ok), response.body
    json[:data].map { |c| c[:name] }
  end

  it "finds by name, several words, roll no., room and khata no., best match first" do
    expect(search("ali")).to eq([ "Ali Raza" ])
    expect(search("raza")).to eq([ "Ali Raza", "Hamza Raza" ])
    expect(search("raza c-7")).to contain_exactly("Ali Raza", "Hamza Raza")
    expect(search("hamza c-7")).to eq([ "Hamza Raza" ])
    expect(search("R-13").first).to eq("Hamza Raza")
    expect(search("##{ahmed.khata_no}")).to eq([ "Ahmed Butt" ])
    expect(search(ahmed.khata_no.to_s).first).to eq("Ahmed Butt")
    expect(search("nobody")).to eq([])
  end

  it "finds by phone or guardian phone, typed with 0, 92, +92 or only part of it" do
    expect(search("0300111")).to eq([ "Ali Raza" ])
    expect(search("+92 300 1112233")).to eq([ "Ali Raza" ])
    expect(search("923211234567")).to eq([ "Ahmed Butt" ])
    expect(search("0311999")).to contain_exactly("Ali Raza", "Hamza Raza") # the guardian's phone finds both siblings
    expect(search("1234567")).to eq([ "Ahmed Butt" ])
  end

  it "works for a cashier at the till and never lists the walk-in customer" do
    within(biz) { Customer.walk_in }
    cashier = add_member!(biz, "cashier")
    expect(search("walk", auth_headers(cashier, app: "pos"))).to eq([])
    expect(search("ali", auth_headers(cashier, app: "pos"))).to eq([ "Ali Raza" ])
    get "/api/v1/customers/search", params: { q: "ali", limit: 1 }, headers: headers
    expect(json[:data].size).to eq(1)
  end

  it "uses the same rules in the admin list" do
    get "/api/v1/customers", params: { q: "0311999" }, headers: headers
    expect(json[:data].map { |c| c[:name] }).to contain_exactly("Ali Raza", "Hamza Raza")
  end
end
