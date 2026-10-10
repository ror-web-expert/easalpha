require "rails_helper"

RSpec.describe "Customers and tables", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  describe "customers" do
    it "creates a walk-in customer at signup that cannot be duplicated, edited or archived" do
      within(biz) do
        expect(Customer.where(is_walk_in: true).count).to eq(1)
        expect { Customer.create!(name: "Another walk-in", is_walk_in: true) }.to raise_error(ActiveRecord::RecordNotUnique)
      end
      walk_in = within(biz) { Customer.walk_in }
      api_patch "/api/v1/customers/#{walk_in.id}", { name: "x" }, headers: headers
      expect(response).to have_http_status(:conflict)
      delete "/api/v1/customers/#{walk_in.id}", headers: headers
      expect(response).to have_http_status(:conflict)
    end

    it "creates customers with sequential khata numbers, normalised phones and addresses, and rejects a duplicate phone" do
      api_post "/api/v1/customers", { name: "Faisal Raza", phone: "0301 0754854", addresses: [ { line1: "Room 26", area: "Boys hostel", is_default: true } ] }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:khata_no]).to eq(2)
      expect(json[:phone]).to eq("+923010754854")
      expect(json[:addresses].first[:text]).to eq("Room 26, Boys hostel")
      api_post "/api/v1/customers", { name: "Dup", phone: "+923010754854" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("customer.phone_exists")
      api_post "/api/v1/customers", { name: "Saad PRC" }, headers: headers
      expect(json[:khata_no]).to eq(3)
    end

    it "looks up by khata, phone fragment and name, and returns the last order for repeat" do
      api_post "/api/v1/customers", { name: "Hanzla Rehman", phone: "03101665453", company: "PRC" }, headers: headers
      cid = json[:id]
      m = build_menu!(biz)
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cid, lines: [ { product_id: m[:chai].id, quantity: 2 } ], place: true }, headers: headers
      expect(response).to have_http_status(:created)
      get "/api/v1/customers?q=%232", headers: headers
      expect(json[:data].map { |c| c[:name] }).to eq([ "Hanzla Rehman" ])
      get "/api/v1/customers?q=1665453", headers: headers
      expect(json[:data].size).to eq(1)
      get "/api/v1/customers?q=hanz", headers: headers
      expect(json[:data].size).to eq(1)
      get "/api/v1/customers/lookup?phone=0310-1665453", headers: headers
      expect(json[:found]).to be true
      expect(json[:last_order][:items].first[:name]).to eq("Chai")
      expect(json[:last_order][:items].first[:quantity]).to eq("2.0")
      get "/api/v1/customers/lookup?phone=03009999999", headers: headers
      expect(json[:found]).to be false
      get "/api/v1/customers/#{cid}/orders", headers: headers
      expect(json[:data].size).to eq(1)
    end

    it "blocks orders for pending or deactivated customers" do
      c = within(biz) { Customer.create!(name: "Pending Online", phone: "+923001112223", source: "online", status: "pending_approval") }
      m = build_menu!(biz)
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: c.id, lines: [ { product_id: m[:chai].id } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("customer.pending")
      api_post "/api/v1/customers/#{c.id}/approve", {}, headers: headers
      expect(json[:status]).to eq("active")
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: c.id, lines: [ { product_id: m[:chai].id } ] }, headers: headers
      expect(response).to have_http_status(:created)
    end

    it "manages groups and imports a CSV, updating by phone" do
      api_post "/api/v1/customer_groups", { name: "Hostel", discount_percent: 5 }, headers: headers
      expect(response).to have_http_status(:created)
      csv = "name,phone,group,address\nAbbas 1st Year,03140062759,Hostel,Room 40\nNo Phone,,Office,\n,0300,,\n"
      api_post "/api/v1/customers/import", { data: csv }, headers: headers
      expect(json[:created]).to eq(2)
      expect(json[:error_rows].size).to eq(1)
      api_post "/api/v1/customers/import", { data: "name,phone\nAbbas Renamed,03140062759\n" }, headers: headers
      expect(json[:updated]).to eq(1)
      get "/api/v1/customer_groups", headers: headers
      expect(json[:data].map { |g| [ g[:name], g[:customer_count] ] }).to include([ "Hostel", 1 ], [ "Office", 1 ])
    end

    it "requires customers.manage to create and isolates tenants" do
      waiter = add_member!(biz, "waiter")
      api_post "/api/v1/customers", { name: "X" }, headers: auth_headers(waiter)
      expect(response).to have_http_status(:forbidden)
      get "/api/v1/customers", headers: auth_headers(waiter)
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/customers", { name: "Mine", phone: "+923001234567" }, headers: headers
      id = json[:id]
      other = signup_business(name: "Other")
      get "/api/v1/customers/#{id}", headers: auth_headers(other)
      expect(response).to have_http_status(:not_found)
      get "/api/v1/customers/lookup?phone=+923001234567", headers: auth_headers(other)
      expect(json[:found]).to be false
    end
  end

  describe "tables" do
    let!(:m) { build_menu!(biz) }

    it "creates floors and tables, lays them out, and shows status with the open order" do
      api_post "/api/v1/tables/floors", { name: "Roof" }, headers: headers
      expect(response).to have_http_status(:created)
      floor = json[:id]
      api_post "/api/v1/tables", { code: "R1-1", seats: 4, location: "Terrace", floor_id: floor }, headers: headers
      expect(response).to have_http_status(:created)
      t1 = json[:id]
      expect(json[:qr_token]).to be_present
      api_post "/api/v1/tables", { code: "R1-2", seats: 2, floor_id: floor }, headers: headers
      t2 = json[:id]
      api_post "/api/v1/tables", { code: "R1-1" }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      api_put "/api/v1/tables/layout", { tables: [ { id: t1, position: { x: 10, y: 20, w: 80, h: 80 } } ] }, headers: headers
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/orders", { order_type: "dine_in", table_id: t1, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      get "/api/v1/tables", headers: headers
      row = json[:data].find { |t| t[:id] == t1 }
      expect(row[:status]).to eq("occupied")
      expect(row[:current_order][:serial]).to eq(1)
      expect(row[:position][:x]).to eq(10)
      expect(json[:summary]).to include(total: 2, occupied: 1, available: 1, seats: 6)
      get "/api/v1/tables/floors", headers: headers
      expect(json[:data].first[:tables].size).to eq(2)
      delete "/api/v1/tables/#{t1}", headers: headers
      expect(response).to have_http_status(:conflict)
      delete "/api/v1/tables/#{t2}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "moves an order between tables, merges two tables, and assigns a waiter" do
      t1 = within(biz) { DiningTable.create!(branch: Branch.first, code: "T1") }
      t2 = within(biz) { DiningTable.create!(branch: Branch.first, code: "T2") }
      t3 = within(biz) { DiningTable.create!(branch: Branch.first, code: "T3") }
      api_post "/api/v1/orders", { order_type: "dine_in", table_id: t1.id, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      o1 = json[:id]
      api_post "/api/v1/tables/#{t1.id}/move", { to_table_id: t2.id }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:code]).to eq("T2")
      expect(json[:current_order][:id]).to eq(o1)
      within(biz) { expect(t1.reload.status).to eq("available") }

      api_post "/api/v1/orders", { order_type: "dine_in", table_id: t3.id, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
      api_post "/api/v1/tables/#{t3.id}/merge", { into_table_id: t2.id }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:current_order][:item_count]).to eq(2)
      expect(json[:current_order][:total_minor]).to eq(8_000 + 1_280 + 45_000 + 7_200)
      within(biz) do
        expect(t3.reload.merged_into_table_id).to eq(t2.id)
        expect(Order.where(status: "voided").count).to eq(1)
      end
      waiter = add_member!(biz, "waiter")
      api_post "/api/v1/tables/#{t2.id}/assign_waiter", { membership_id: waiter.id }, headers: headers
      expect(json[:waiter_membership_id]).to eq(waiter.id)
      within(biz) { expect(Order.find(o1).waiter_membership_id).to eq(waiter.id) }
    end

    it "requires tables.manage to create tables and isolates tenants" do
      cashier = add_member!(biz, "cashier")
      api_post "/api/v1/tables", { code: "X1" }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
      t = within(biz) { DiningTable.create!(branch: Branch.first, code: "T9") }
      other = signup_business(name: "Other")
      api_patch "/api/v1/tables/#{t.id}", { seats: 8 }, headers: auth_headers(other)
      expect(response).to have_http_status(:not_found)
    end
  end
end
