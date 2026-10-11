require "rails_helper"

# SPEC "Orders, order taking and tables": SPEC statuses and payment statuses, filters and sorts, the order story,
# the reopen flow with its own permissions and PIN, complete and place-and-complete, pending orders across days,
# bulk actions, cost analysis, customer required per order type, the Mobile App source and the Maintenance table status.
RSpec.describe "SPEC order flows", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  def create_order(lines, h = headers, extra = {})
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: h
    expect(response).to have_http_status(:created)
    json
  end

  def pay(id, amount, h = headers)
    api_post "/api/v1/orders/#{id}/payments", { payments: [ { method_code: "cash", amount_minor: amount, tendered_minor: amount } ] }, headers: h
    expect(response).to have_http_status(:ok).or have_http_status(:created)
    json
  end

  describe "SPEC statuses and filters" do
    it "maps internal states to the SPEC names and filters by them, by payment method and by date range" do
      o = create_order([ { product_id: m[:chai].id } ])
      expect(o[:spec_status]).to eq("pending")
      expect(o[:spec_payment_status]).to eq("unpaid")
      pay(o[:id], o[:total_minor])
      get "/api/v1/orders/#{o[:id]}", headers: headers
      expect(json[:spec_status]).to eq("completed")
      expect(json[:spec_payment_status]).to eq("paid")
      get "/api/v1/orders?status=completed", headers: headers
      expect(json[:data].map { |x| x[:id] }).to include(o[:id])
      get "/api/v1/orders?status=open", headers: headers
      expect(json[:data].map { |x| x[:id] }).not_to include(o[:id])
      get "/api/v1/orders?payment_method=cash", headers: headers
      expect(json[:data].size).to eq(1)
      get "/api/v1/orders?from=2020-01-01&to=2020-01-02", headers: headers
      expect(json[:data]).to be_empty
      get "/api/v1/orders?from=#{today_for(biz) - 1}&to=#{today_for(biz) + 1}&sort=amount_desc", headers: headers
      expect(json[:data].size).to eq(1)
      get "/api/v1/orders?sort=upside_down", headers: headers
      expect(response).to have_http_status(:bad_request)
    end

    it "accepts the Mobile App source and a Maintenance table status" do
      create_order([ { product_id: m[:chai].id } ], headers, { source: "app" })
      expect(json[:source]).to eq("app")
      within(biz) { expect(DiningTable.create!(branch: branch, code: "T7", seats: 2, status: "maintenance").status).to eq("maintenance") }
    end
  end

  describe "order story and reopen" do
    it "records punched, edited, completed, reopened with the item and money diff, and counts reopens" do
      o = create_order([ { product_id: m[:chai].id, quantity: 1 } ])
      pay(o[:id], o[:total_minor])
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:reopen_count]).to eq(1)
      expect(json[:spec_status]).to eq("ready")
      line = json[:items].first
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 1 }, { product_id: m[:burger].id, quantity: 1 } ] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:edit_count]).to eq(1)
      story = json[:story]
      expect(story[:punched_by]).to eq(owner.user.name)
      expect(story[:events].map { |e| e[:type] }).to eq(%w[punched completed reopened edited])
      edit = story[:events].last
      expect(edit[:diff][:added].first[:name]).to eq("Zinger Burger")
      expect(edit[:amount_after]).to be > edit[:amount_before]
      expect(json[:spec_payment_status]).to eq("pending") # partly paid after the edit
      # A reopened order always goes through the payment screen: completing before paying is refused.
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
      expect(response).to have_http_status(:conflict)
      pay(o[:id], json[:error] ? Order.find(o[:id]).due_minor : 0)
      get "/api/v1/orders/#{o[:id]}", headers: headers
      expect(json[:spec_status]).to eq("completed")
      expect(json[:story][:events].map { |e| e[:type] }.last).to eq("completed")
    end

    it "needs REOPEN_ORDER, and DELETE_ORDER_ITEM or MODIFY_REOPEN_DECREASE_QTY to shrink a reopened order" do
      o = create_order([ { product_id: m[:chai].id, quantity: 2 }, { product_id: m[:burger].id, quantity: 1 } ])
      pay(o[:id], o[:total_minor])
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS REOPEN_ORDER PAYMENT ACCEPT_PAYMENT]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: ch
      expect(response).to have_http_status(:ok)
      chai, burger = json[:items]
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: chai[:id], quantity: 1 }, { id: burger[:id], quantity: 1 } ] }, headers: ch
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:message]).to include("MODIFY_REOPEN_DECREASE_QTY")
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: chai[:id], quantity: 2 } ] }, headers: ch
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:message]).to include("DELETE_ORDER_ITEM")
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS REOPEN_ORDER DELETE_ORDER_ITEM MODIFY_REOPEN_DECREASE_QTY]) }
      ch = auth_headers(cashier.reload)
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: chai[:id], quantity: 1 } ] }, headers: ch
      expect(response).to have_http_status(:ok)
      expect(json[:story][:events].last[:diff][:removed].first[:name]).to eq("Zinger Burger")
      expect(json[:story][:events].last[:diff][:changed].first).to include(from: "2.0", to: "1.0")
    end

    it "demands the order-update PIN when the restriction is ticked" do
      o = create_order([ { product_id: m[:chai].id } ])
      pay(o[:id], o[:total_minor])
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS REOPEN_ORDER DELETE_ORDER_ITEM MODIFY_REOPEN_DECREASE_QTY REQUIRE_PIN_FOR_ORDER_UPDATE]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: ch
      line = json[:items].first
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 2 } ] }, headers: ch
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("pin.required")
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 2 } ], pin: "1111" }, headers: ch
      expect(response).to have_http_status(:ok)
    end
  end

  describe "complete, place and complete, direct unpaid" do
    it "completes a paid order, refuses an unpaid one, and allows unpaid only with the setting and the permission" do
      o = create_order([ { product_id: m[:chai].id } ])
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
      expect(response).to have_http_status(:conflict)
      api_patch "/api/v1/settings", { values: { "pos.order_behavior.direct_unpaid_orders" => true } }, headers: headers
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers # admins always qualify
      expect(response).to have_http_status(:ok)
      expect(json[:spec_status]).to eq("completed")
      expect(json[:spec_payment_status]).to eq("unpaid")
      expect(json[:unpaid_direct]).to be true
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS COMPLETE_ORDER PLACE_AND_COMPLETE_ORDER]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], complete: true }, headers: ch
      expect(response).to have_http_status(:conflict)
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS COMPLETE_ORDER PLACE_AND_COMPLETE_ORDER PLACE_UNPAID_DIRECT]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], complete: true }, headers: ch
      expect(response).to have_http_status(:created)
      expect(json[:spec_status]).to eq("completed")
    end
  end

  describe "pending orders and bulk actions" do
    it "lists open orders across days with tiles, marks all paid ones completed, and syncs complimentary orders" do
      a = create_order([ { product_id: m[:chai].id } ])
      b = create_order([ { product_id: m[:chai].id } ])
      pay(b[:id], b[:total_minor])
      within(biz) { Order.find(b[:id]).update_columns(status: "served") } # paid but never completed
      old = create_order([ { product_id: m[:chai].id } ])
      within(biz) { Order.find(old[:id]).update_columns(business_day: today_for(biz) - 3) }
      get "/api/v1/orders/pending", headers: headers
      expect(json[:tiles]).to include(today: 2, previous_days: 1, all_time: 3)
      expect(json[:calendar].size).to eq(2)
      api_post "/api/v1/orders/bulk_complete", {}, headers: headers
      expect(json).to include(completed: 1, skipped_unpaid: 1)
      get "/api/v1/orders/#{a[:id]}", headers: headers
      expect(json[:spec_status]).to eq("pending")
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true, is_staff_meal: true, staff_meal_reason: "lunch" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:spec_payment_status]).to eq("complimentary")
      api_post "/api/v1/orders/sync_complimentary", {}, headers: headers
      expect(response).to have_http_status(:ok)
    end
  end

  describe "cost analysis and customer required" do
    it "returns revenue, cost and margin for one order" do
      o = create_order([ { product_id: m[:chai].id } ])
      get "/api/v1/orders/#{o[:id]}/cost_analysis", headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:revenue_minor]).to eq(o[:total_minor] - o[:tax_minor])
      expect(json[:items].size).to eq(1)
      get "/api/v1/orders/#{o[:id]}/cost_analysis", headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end

    it "refuses to place a delivery order without a customer when the setting says so" do
      api_patch "/api/v1/settings", { values: { "pos.customer_required.walk_in" => true } }, headers: headers
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(json[:error][:code]).to eq("customer.required")
      api_patch "/api/v1/settings", { values: { "pos.customer_required.walk_in" => false } }, headers: headers
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      expect(response).to have_http_status(:created)
    end
  end

  describe "receipt payments and table maintenance" do
    it "names who collected each payment and lets a table be put in maintenance" do
      o = create_order([ { product_id: m[:chai].id } ])
      pay(o[:id], o[:total_minor])
      get "/api/v1/orders/#{o[:id]}/receipt", headers: headers
      expect(json[:payments].first).to include(method: "cash", received_by: owner.user.name)
      expect(json[:payments].first[:received_at]).to be_present
      t = within(biz) { DiningTable.create!(branch: branch, code: "T8", seats: 2) }
      api_patch "/api/v1/tables/#{t.id}", { status: "maintenance" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:status]).to eq("maintenance")
    end
  end
end
