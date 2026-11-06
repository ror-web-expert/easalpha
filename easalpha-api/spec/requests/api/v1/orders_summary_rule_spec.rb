require "rails_helper"

# GET /orders/summary (the admin Orders page's day cards) follows the one revenue rule, so its money equals the sales
# overview for the same day (leftovers of 7 Nov 2026, L1 item 1). The day holds a full refund of the previous day's
# order, a part refund, a staff meal with a discount, a service charge and tax, and part payments handed back on open
# orders, one paid in full afterwards and one left open.
RSpec.describe "Orders summary by the revenue rule", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:day) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def h = auth_headers(owner)

  def order!(lines, **extra)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: h
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o, amount = o[:total_minor])
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: amount } ] }, headers: h
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def refund!(o, amount)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: "cash", reason: "cold" }, headers: h
    expect(response).to have_http_status(:created), response.body
  end

  def discount!(o)
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 10, reason: "Regular guest" }, headers: h
    expect(response).to have_http_status(:ok), response.body
    json
  end

  def summary(on)
    get "/api/v1/orders/summary", params: { business_day: on.to_s }, headers: h
    expect(response).to have_http_status(:ok), response.body
    json
  end

  def overview(on)
    get "/api/v1/reports/overview", params: { from: on.to_s, to: on.to_s }, headers: h
    expect(response).to have_http_status(:ok), response.body
    json
  end

  def money = %i[revenue_minor discount_minor tax_minor service_charge_minor average_order_minor refunds_minor]

  it "states each day's revenue, discount, tax, service charge and average as the sales overview does" do
    earlier = travel_to(Time.current - 1.day) { pay!(order!([ { product_id: m[:burger].id } ])) }
    refund!(earlier, earlier[:total_minor])                              # the previous day's sale, refunded in full today

    part = order!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ], service_charge_percent: 10)
    part = pay!(discount!(part))
    refund!(part, 10_000)                                                # Rs 100 of it back today

    meal = order!([ { product_id: m[:burger].id } ], is_staff_meal: true, staff_meal_reason: "Kitchen lunch", service_charge_percent: 10)
    meal = discount!(meal)
    api_post "/api/v1/orders/#{meal[:id]}/complete", {}, headers: h
    expect(response).to have_http_status(:ok), response.body
    expect(meal).to include(total_minor: 0)
    expect(meal[:tax_minor]).to be_positive
    expect(meal[:service_charge_minor]).to be_positive

    back = order!([ { product_id: m[:burger].id } ])
    pay!(back, 20_000)
    refund!(back, 20_000)                                                # a part payment handed back while it was open,
    pay!(back)                                                           # then paid in full: a sale at its total, no refund
    left = order!([ { product_id: m[:chai].id } ])
    pay!(left, 5_000)
    refund!(left, 5_000)                                                 # handed back and still open: no sale, no refund

    s = summary(day)
    o = overview(day)
    expect(s.slice(*money)).to eq(o.slice(*money))
    expect(s[:sold_orders]).to eq(o[:orders])
    # The two sales of the day less what the day's refunds took back: all of the earlier sale and Rs 100 of this one.
    expect(s).to include(sold_orders: 2, revenue_minor: part[:total_minor] - 10_000 + back[:total_minor] - earlier[:total_minor],
                         refunds_minor: earlier[:total_minor] + 10_000, discount_minor: part[:discount_minor],
                         average_order_minor: (part[:total_minor] - 10_000 + back[:total_minor] - earlier[:total_minor]) / 2)
    # The staff meal is no sale: its tax and service charge are not the day's, and the refunds took their shares back.
    expect(s[:tax_minor]).to be < part[:tax_minor] + back[:tax_minor]
    expect(s[:service_charge_minor]).to be < part[:service_charge_minor]
    # The counts still describe the orders taken that day.
    expect(s).to include(orders: 4, paid_orders: 3, open_orders: 1, staff_meals: 1)

    # The sale refunded in full stays on its own day.
    s = summary(day - 1)
    o = overview(day - 1)
    expect(s.slice(*money)).to eq(o.slice(*money))
    expect(s).to include(sold_orders: 1, revenue_minor: earlier[:total_minor], refunds_minor: 0, paid_orders: 0)
  end

  it "refuses a business day that is not a date" do
    get "/api/v1/orders/summary", params: { business_day: "yesterday-ish" }, headers: h
    expect(response).to have_http_status(:bad_request)
    expect(json[:error][:code]).to eq("orders.business_day")
  end
end
