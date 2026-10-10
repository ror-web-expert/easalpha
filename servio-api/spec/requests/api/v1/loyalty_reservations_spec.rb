require "rails_helper"

RSpec.describe "Loyalty, campaigns, reservations, commissions and checklists", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  it "earns points on paid orders, redeems them as a capped discount, refunds on void, and sends birthday offers" do
    m
    api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true, loyalty_rupees_per_point: 100, loyalty_point_value_minor: 100, loyalty_min_redeem_points: 50, loyalty_max_redeem_percent: 50 }, headers: headers
    expect(json[:loyalty_enabled]).to be true
    api_post "/api/v1/customers", { name: "Sara", phone: "03001230000", birthday: Date.current.to_s, whatsapp_opt_in: true }, headers: headers
    cust = json
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust[:id], lines: [{ product_id: m[:burger].id, quantity: 2 }], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [{ method_code: "cash", amount_minor: o[:total_minor] }] }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/customers/#{cust[:id]}/loyalty", headers: headers
    expect(json[:points]).to eq(o[:total_minor] / 100 / 100) # Rs 1,044 -> 10 points
    expect(json[:transactions].first[:kind]).to eq("earn")
    api_post "/api/v1/customers/#{cust[:id]}/loyalty/adjust", { points: 90, note: "Welcome bonus" }, headers: headers
    expect(json[:points]).to eq(100)

    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust[:id], lines: [{ product_id: m[:chai].id, quantity: 2 }] }, headers: headers
    o2 = json
    api_post "/api/v1/orders/#{o2[:id]}/redeem_points", { points: 100 }, headers: headers
    expect(response).to have_http_status(:conflict) # Rs 100 is more than 50% of Rs 160
    expect(json[:error][:code]).to eq("loyalty.cap")
    api_post "/api/v1/orders/#{o2[:id]}/redeem_points", { points: 60 }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:discount_minor]).to eq(6_000)
    expect(json[:total_minor]).to eq(((16_000 - 6_000) * 1.16).round)
    get "/api/v1/customers/#{cust[:id]}/loyalty", headers: headers
    expect(json[:points]).to eq(40)
    api_post "/api/v1/orders/#{o2[:id]}/redeem_points", { points: 10 }, headers: headers
    expect(response).to have_http_status(:bad_request)
    api_post "/api/v1/orders/#{o2[:id]}/void", { reason: "Changed mind" }, headers: headers
    expect(response).to have_http_status(:ok)
    get "/api/v1/customers/#{cust[:id]}/loyalty", headers: headers
    expect(json[:points]).to eq(100)
    expect(json[:transactions].first[:kind]).to eq("refund")

    expect(within(biz) { Loyalty.birthday_offers! }).to eq(1)
    expect(within(biz) { Loyalty.birthday_offers! }).to eq(0)
    promo = within(biz) { Promotion.find_by!(kind: "coupon", unit_limit: 1) }
    expect(promo.coupon_code).to start_with("BDAY")
    expect(within(biz) { WhatsappMessage.where(template_name: "birthday_offer").count }).to eq(1)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust[:id], lines: [{ product_id: m[:chai].id }] }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/discounts", { coupon_code: promo.coupon_code }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:discount_minor]).to eq(800)
  end

  it "builds campaign audiences, sends only to opted-in customers with personalised text, and reports stats" do
    api_post "/api/v1/customers", { name: "Opted In", phone: "03001110001", whatsapp_opt_in: true }, headers: headers
    api_post "/api/v1/customers", { name: "Not Opted", phone: "03001110002", whatsapp_opt_in: false }, headers: headers
    api_post "/api/v1/customers", { name: "No Phone" }, headers: headers
    get "/api/v1/campaigns/audience?kind=all", headers: headers
    expect(json).to include(total: 2, reachable: 1, not_opted_in: 1)
    api_post "/api/v1/promotions", { name: "Eid 15", kind: "coupon", value: 15, coupon_code: "EID15" }, headers: headers
    promo = json
    api_post "/api/v1/campaigns", { name: "Eid blast", body: "Hi {name}, use {code} for 15% off this week!", segment: { kind: "all" }, promotion_id: promo[:id], send_now: true }, headers: headers
    expect(response).to have_http_status(:created)
    c = json
    expect(c[:status]).to eq("sent")
    expect(c[:sent_count]).to eq(1)
    expect(c[:skipped_count]).to eq(1)
    msg = within(biz) { WhatsappMessage.find_by!(campaign_id: c[:id]) }
    expect(msg.variables["text"]).to eq("Hi Opted In, use EID15 for 15% off this week!")
    expect(msg.kind).to eq("marketing")
    get "/api/v1/campaigns/#{c[:id]}/stats", headers: headers
    expect(json[:sent]).to eq(1)
    api_post "/api/v1/campaigns", { name: "Later", body: "Soon", segment: { kind: "inactive", days: 30 }, scheduled_at: 1.hour.from_now.iso8601 }, headers: headers
    expect(json[:status]).to eq("scheduled")
    within(biz) { Campaign.where(status: "scheduled").update_all(scheduled_at: 1.minute.ago) }
    expect { CampaignSweepJob.perform_now }.to have_enqueued_job(CampaignSendJob).once
  end

  it "books reservations with conflict checks and deposits, reminds, seats onto a table with an order, and lists availability" do
    m
    t1 = within(biz) { DiningTable.create!(branch: branch, code: "T1", seats: 4) }
    t2 = within(biz) { DiningTable.create!(branch: branch, code: "T2", seats: 2) }
    api_post "/api/v1/customers", { name: "Hamza", phone: "03005550001" }, headers: headers
    cust = json
    starts = (Time.current + 3.hours).change(min: 0)
    api_post "/api/v1/reservations", { table_id: t1.id, customer_id: cust[:id], party_size: 4, starts_at: starts.iso8601, duration_minutes: 90, deposit_minor: 50_000, deposit_method_code: "cash", notes: "Window" }, headers: headers
    expect(response).to have_http_status(:created)
    r = json
    expect(r[:guest_name]).to eq("Hamza")
    expect(r[:deposit_payment_id]).to be_present
    expect(within(biz) { Customer.find(cust[:id]).balance_minor }).to eq(-50_000)
    expect(within(biz) { WhatsappMessage.where(template_name: "reservation_confirmed").count }).to eq(1)
    api_post "/api/v1/reservations", { table_id: t1.id, guest_name: "Clash", party_size: 2, starts_at: (starts + 30.minutes).iso8601 }, headers: headers
    expect(response).to have_http_status(:conflict)
    get "/api/v1/reservations/availability?starts_at=#{CGI.escape(starts.iso8601)}&party_size=2", headers: headers
    expect(json[:tables].map { |t| t[:code] }).to eq(["T2"])
    api_post "/api/v1/reservations", { table_id: t2.id, guest_name: "Later", party_size: 2, starts_at: (starts + 2.hours).iso8601 }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/reservations?upcoming=true", headers: headers
    expect(json[:data].size).to eq(2)

    within(biz) { Reservation.where(id: r[:id]).update_all(starts_at: 1.hour.from_now, ends_at: 2.5.hours.from_now) }
    expect(within(biz) { Reservations::Manager.send_reminders! }).to eq(1)
    expect(within(biz) { Reservations::Manager.send_reminders! }).to eq(0)
    api_post "/api/v1/reservations/#{r[:id]}/confirm", {}, headers: headers
    expect(json[:status]).to eq("confirmed")
    api_post "/api/v1/reservations/#{r[:id]}/seat", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("seated")
    expect(json[:order_id]).to be_present
    get "/api/v1/orders/#{json[:order_id]}", headers: headers
    expect(json[:table_id]).to eq(t1.id)
    expect(json[:covers]).to eq(4)
    expect(within(biz) { DiningTable.find(t1.id).status }).to eq("occupied")
    api_post "/api/v1/reservations/#{r[:id]}/no_show", {}, headers: headers
    expect(response).to have_http_status(:conflict)
  end

  it "computes commissions from rules and runs opening and closing checklists" do
    m
    waiter = add_member!(biz, "waiter")
    api_post "/api/v1/commission_rules", { name: "Waiter 2%", applies_to: "waiter", role_key: "waiter", basis: "percent_of_sales", value: 2 }, headers: headers
    expect(response).to have_http_status(:created)
    api_post "/api/v1/commission_rules", { name: "Order taker Rs 5", applies_to: "order_taker", basis: "per_order", value: 5 }, headers: headers
    api_post "/api/v1/orders", { order_type: "dine_in", lines: [{ product_id: m[:burger].id, quantity: 2 }], place: true }, headers: auth_headers(waiter, app: "pos")
    o = json
    within(biz) { Order.find(o[:id]).update_columns(waiter_membership_id: waiter.id) }
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [{ method_code: "cash", amount_minor: o[:total_minor] }] }, headers: headers
    get "/api/v1/reports/commissions", headers: headers
    rows = json[:rows]
    w = rows.find { |r| r[:applies_to] == "waiter" }
    expect(w[:commission_minor]).to eq((o[:total_minor] * 0.02).round)
    taker = rows.find { |r| r[:applies_to] == "order_taker" }
    expect(taker[:commission_minor]).to eq(500)
    expect(json[:total_commission_minor]).to eq(w[:commission_minor] + 500)

    get "/api/v1/checklists/templates", headers: headers
    expect(json[:data].map { |t| t[:kind] }).to eq(%w[opening closing])
    api_put "/api/v1/checklists/templates/opening", { items: [{ label: "Count float" }, { label: "Check gas" }], required_for_shift: true }, headers: headers
    expect(json[:items].size).to eq(2)
    get "/api/v1/checklists/today?kind=opening", headers: headers
    run = json
    expect(run[:total_count]).to eq(2)
    api_post "/api/v1/checklists/runs/#{run[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/checklists/runs/#{run[:id]}/tick", { key: "item_1", done: true }, headers: headers
    api_post "/api/v1/checklists/runs/#{run[:id]}/tick", { key: "item_2", done: true }, headers: headers
    expect(json[:done_count]).to eq(2)
    api_post "/api/v1/checklists/runs/#{run[:id]}/complete", {}, headers: headers
    expect(json[:completed_at]).to be_present
    get "/api/v1/checklists/today?kind=opening", headers: headers
    expect(json[:id]).to eq(run[:id])
    get "/api/v1/checklists/runs", headers: headers
    expect(json[:data].size).to eq(1)
  end
end
