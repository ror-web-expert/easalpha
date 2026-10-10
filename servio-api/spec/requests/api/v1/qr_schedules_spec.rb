require "rails_helper"

RSpec.describe "QR ordering, queue display and scheduled reports", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:table) { within(biz) { DiningTable.create!(branch: branch, code: "T7", seats: 4) } }

  it "serves the menu for a table card only when enabled, takes a guest order that waits for the cashier, and accepts it into the kitchen" do
    m
    get "/api/v1/qr/#{table.qr_token}"
    expect(response).to have_http_status(:ok)
    expect(json[:ordering]).to be false
    get "/api/v1/qr/nope"
    expect(response).to have_http_status(:not_found)
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: true, guest_name: true } }, headers: headers
    expect(json[:qr_settings][:enabled]).to be true
    get "/api/v1/tables/#{table.id}/qr", headers: headers
    expect(json[:url]).to end_with("/q/#{table.qr_token}")
    get "/api/v1/qr/#{table.qr_token}"
    expect(json[:ordering]).to be true
    expect(json[:products].map { |p| p[:name] }).to include("Zinger Burger", "Chai")
    expect(json[:table][:code]).to eq("T7")

    api_post "/api/v1/qr/#{table.qr_token}/orders", { lines: [{ product_id: m[:burger].id, quantity: 1 }] }
    expect(response).to have_http_status(:unprocessable_content)
    api_post "/api/v1/qr/#{table.qr_token}/orders", { guest_name: "Ayesha", lines: [{ product_id: m[:burger].id, quantity: 1, modifiers: [{ modifier_id: m[:hot].id }] }, { product_id: m[:chai].id, quantity: 2 }] }
    expect(response).to have_http_status(:created)
    guest = json
    expect(guest[:qr_status]).to eq("pending")
    expect(guest[:status]).to eq("draft")
    expect(guest[:total_minor]).to eq(((45_000 + 2_000 + 16_000) * 1.16).round)
    expect(within(biz) { KitchenTicket.count }).to eq(0)
    expect(within(biz) { Notification.find_by(kind: "qr_order") }).to be_present
    get "/api/v1/qr/#{table.qr_token}/orders/#{guest[:id]}?guest_token=#{guest[:guest_token]}"
    expect(json[:message]).to include("Waiting")
    get "/api/v1/qr/#{table.qr_token}/orders/#{guest[:id]}?guest_token=wrong"
    expect(response).to have_http_status(:not_found)

    get "/api/v1/qr_orders?status=pending", headers: headers
    expect(json[:data].size).to eq(1)
    expect(json[:data].first[:guest_name]).to eq("Ayesha")
    api_post "/api/v1/qr_orders/#{guest[:id]}/accept", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("placed")
    expect(json[:serial]).to eq(1)
    expect(within(biz) { KitchenTicket.count }).to be >= 1
    get "/api/v1/qr/#{table.qr_token}/bill"
    expect(json[:label]).to eq("#1")
    expect(json[:items].size).to eq(2)
    get "/api/v1/kitchen/queue", headers: headers
    expect(json[:preparing].map { |o| o[:serial] }).to eq([1])
    api_post "/api/v1/kitchen/orders/#{guest[:id]}/bump", {}, headers: headers
    get "/api/v1/kitchen/queue", headers: headers
    expect(json[:ready].map { |o| o[:serial] }).to eq([1])

    api_post "/api/v1/qr/#{table.qr_token}/orders", { guest_name: "Ayesha", lines: [{ product_id: m[:chai].id, quantity: 1 }] }
    expect(response).to have_http_status(:created)
    expect(json[:id]).to eq(guest[:id])
    expect(json[:qr_status]).to eq("pending")
    expect(json[:items].size).to eq(3)
    api_post "/api/v1/qr_orders/#{guest[:id]}/accept", {}, headers: headers
    expect(json[:items].count { |i| i[:status] == "sent" }).to eq(1)
  end

  it "rejects a pending order, sends orders straight to the kitchen without cashier accept, and handles waiter and bill requests" do
    m
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: true, guest_name: false } }, headers: headers
    api_post "/api/v1/qr/#{table.qr_token}/orders", { lines: [{ product_id: m[:chai].id }] }
    pending_id = json[:id]
    api_post "/api/v1/qr_orders/#{pending_id}/reject", { reason: "Kitchen closed" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("voided")
    expect(within(biz) { DiningTable.find(table.id).status }).to eq("available")

    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: false, guest_name: false } }, headers: headers
    api_post "/api/v1/qr/#{table.qr_token}/orders", { lines: [{ product_id: m[:chai].id }] }
    expect(response).to have_http_status(:created)
    expect(json[:qr_status]).to eq("accepted")
    expect(json[:status]).to eq("placed")
    expect(json[:label]).to eq("#1")

    api_post "/api/v1/qr/#{table.qr_token}/requests", { kind: "call_waiter", guest_name: "Table 7 guest" }
    expect(response).to have_http_status(:created)
    rid = json[:id]
    api_post "/api/v1/qr/#{table.qr_token}/requests", { kind: "call_waiter" }
    expect(json[:id]).to eq(rid)
    api_post "/api/v1/qr/#{table.qr_token}/requests", { kind: "ask_bill" }
    get "/api/v1/qr_orders/requests?open=true", headers: headers
    expect(json[:data].map { |r| r[:kind] }).to contain_exactly("call_waiter", "ask_bill")
    api_post "/api/v1/qr_orders/requests/#{rid}/handle", {}, headers: headers
    get "/api/v1/qr_orders/requests?open=true", headers: headers
    expect(json[:data].map { |r| r[:kind] }).to eq(["ask_bill"])
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, call_waiter: false } }, headers: headers
    api_post "/api/v1/qr/#{table.qr_token}/requests", { kind: "call_waiter" }
    expect(response).to have_http_status(:conflict)
  end

  it "schedules reports, previews the text, runs one now by WhatsApp and email, and computes the next run" do
    m
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [{ product_id: m[:chai].id, quantity: 3 }], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [{ method_code: "cash", amount_minor: json[:total_minor] }] }, headers: headers
    within(biz) { Order.update_all(business_day: Date.current - 1) }
    api_post "/api/v1/report_schedules", { name: "Daily sales", kind: "sales", cadence: "daily", hour: 9, channel: "both", recipients: ["0300 1234567", "owner@example.com"] }, headers: headers
    expect(response).to have_http_status(:created)
    s = json
    expect(s[:next_run_at]).to be_present
    expect(Time.iso8601(s[:next_run_at])).to be > Time.current
    api_post "/api/v1/report_schedules", { name: "Bad", kind: "sales", recipients: [] }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    get "/api/v1/report_schedules/#{s[:id]}/preview", headers: headers
    expect(json[:text]).to include("Orders 1")
    expect(json[:text]).to include("net sales Rs 278")
    expect do
      api_post "/api/v1/report_schedules/#{s[:id]}/run", {}, headers: headers
    end.to have_enqueued_job(ActionMailer::MailDeliveryJob)
    expect(response).to have_http_status(:ok)
    expect(json[:sent_to]).to eq(["0300 1234567", "owner@example.com"])
    expect(json[:schedule][:last_run_at]).to be_present
    expect(within(biz) { WhatsappMessage.where(template_name: "scheduled_report").count }).to eq(1)
    api_post "/api/v1/report_schedules", { name: "Weekly items", kind: "items", cadence: "weekly", weekday: 1, hour: 8, channel: "whatsapp", recipients: ["03001234567"] }, headers: headers
    expect(Time.iso8601(json[:next_run_at]).in_time_zone("Asia/Karachi").wday).to eq(1)
    get "/api/v1/report_schedules", headers: headers
    expect(json[:data].size).to eq(2)
    within(biz) { ReportSchedule.update_all(next_run_at: 1.minute.ago) }
    expect { ReportScheduleSweepJob.perform_now }.to have_enqueued_job(ReportScheduleJob).twice
  end
end
