require "rails_helper"

# Browser push notifications and the linked-phone WhatsApp provider.
RSpec.describe "Push and WhatsApp connection", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier") }

  it "hands out the VAPID key, stores a subscription per browser, pushes notifications to managers, and removes gone endpoints" do
    get "/api/v1/push/public_key", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:public_key]).to be_present
    api_post "/api/v1/push/subscriptions", { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" }, app: "admin" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:app]).to eq("admin")
    api_post "/api/v1/push/subscriptions", { endpoint: "https://push.example/abc", keys: { p256dh: "p2", auth: "a2" }, app: "admin" }, headers: headers
    within(biz) { expect(PushSubscription.count).to eq(1) }
    get "/api/v1/push/subscriptions", headers: headers
    expect(json[:data].size).to eq(1)

    allow(PushDeliveryJob).to receive(:perform_later)
    api_post "/api/v1/push/test", {}, headers: headers
    expect(response).to have_http_status(:accepted)
    expect(json[:sent]).to eq(1)
    # An in-app notification for managers becomes a push; a switched-off kind does not.
    within(biz) { Notification.create!(kind: "cash_short", title: "Cash short", body: "Rs 500", link: "/money/shifts/1") }
    expect(PushDeliveryJob).to have_received(:perform_later).with(anything, hash_including(title: "Cash short", url: "/admin/money/shifts/1")).once
    api_patch "/api/v1/settings", { values: { "notifications.big_void" => false } }, headers: headers
    within(biz) { Notification.create!(kind: "big_void", title: "Void", body: "x", link: "/orders/1") }
    expect(PushDeliveryJob).not_to have_received(:perform_later).with(anything, hash_including(title: "Void"))

    # A gone endpoint is dropped by the delivery job.
    sub = within(biz) { PushSubscription.first }
    gone = double("response", body: "Gone", code: "410", message: "Gone", to_hash: {})
    allow(WebPush).to receive(:payload_send).and_raise(WebPush::ExpiredSubscription.new(gone, "push.example"))
    PushDeliveryJob.perform_now(sub.id, { title: "x" })
    within(biz) { expect(PushSubscription.count).to eq(0) }

    api_post "/api/v1/push/subscriptions", { endpoint: "https://push.example/c", keys: { p256dh: "p", auth: "a" }, app: "pos" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    delete "/api/v1/push/subscriptions", params: { endpoint: "https://push.example/c" }.to_json, headers: auth_headers(cashier).merge("CONTENT_TYPE" => "application/json")
    expect(response).to have_http_status(:no_content)
  end

  it "reports the linked-phone connection, starts pairing, sends through the phone when connected, and logs when nothing can send" do
    get "/api/v1/whatsapp/connection", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json).to include(provider: "web", status: "unavailable", gateway_configured: false)
    expect(json[:last_error]).to include("WHATSAPP_GATEWAY_URL")

    cust = within(biz) { Customer.create!(name: "Ali", phone: "+923001234567") }
    api_post "/api/v1/whatsapp/send", { customer_id: cust.id, template: "account_statement" }, headers: headers
    expect(json[:status]).to eq("logged") # no phone linked yet: stored, not sent

    allow(Whatsapp::Gateway).to receive(:configured?).and_return(true)
    allow(Whatsapp::Gateway).to receive(:status).and_return({ status: "qr", qr: "data:image/png;base64,AAA", phone: nil })
    allow(Whatsapp::Gateway).to receive(:start!).and_return({ status: "qr", qr: "data:image/png;base64,AAA", phone: nil })
    api_post "/api/v1/whatsapp/connection/start", {}, headers: headers
    expect(response).to have_http_status(:accepted)
    expect(json).to include(status: "qr")
    expect(json[:qr]).to start_with("data:image/png")

    allow(Whatsapp::Gateway).to receive(:status).and_return({ status: "connected", qr: nil, phone: "+923000000000", connected_at: Time.current })
    allow(Whatsapp::Gateway).to receive(:send_text!).and_return("wamid.1")
    api_post "/api/v1/whatsapp/send", { customer_id: cust.id, template: "account_statement" }, headers: headers
    expect(response).to have_http_status(:created)
    msg = within(biz) { WhatsappMessage.find(json[:id]) }
    expect(msg.status).to eq("queued")
    WhatsappDeliveryJob.perform_now(msg.id)
    expect(msg.reload).to have_attributes(status: "sent", provider_message_id: "wamid.1")
    expect(Whatsapp::Gateway).to have_received(:send_text!).with(anything, to: "+923001234567", text: a_string_including("Ali"))

    allow(Whatsapp::Gateway).to receive(:logout!).and_return({ status: "disconnected", qr: nil, phone: nil })
    api_post "/api/v1/whatsapp/connection/logout", {}, headers: headers
    expect(json[:status]).to eq("disconnected")
    get "/api/v1/whatsapp/connection", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end
end
