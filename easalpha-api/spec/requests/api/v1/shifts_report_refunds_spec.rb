require "rails_helper"

# The shifts report (GET /reports/shifts, the Grand report's shift cards) gave each shift its Z report's net, which is
# before refunds, and nothing for an open shift (leftovers of 7 Nov 2026, L1 item 2). Each shift now shows its sales,
# the refunds it made and its net sales after them by the one revenue rule: a sale in the shift that took the order, a
# refund in the shift that gave the money back, and money handed back on an open order no refund. The Z report keeps
# its own lines.
RSpec.describe "Shifts report: net sales after refunds", type: :request do
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

  def open_shift!
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: h
    expect(response).to have_http_status(:created), response.body
    json
  end

  it "shows each shift's sales, the refunds it made and its net after them, and the shifts add up to the day" do
    first = open_shift!
    burger = pay!(order!([ { product_id: m[:burger].id } ]))             # Rs 522
    part = pay!(order!([ { product_id: m[:burger].id } ]))
    refund!(part, 10_000)                                                # Rs 100 back in this shift
    back = order!([ { product_id: m[:burger].id } ])
    pay!(back, 20_000)
    refund!(back, 20_000)                                                # a part payment handed back while it was open,
    pay!(back)                                                           # then paid in full: no refund of the sale
    meal = order!([ { product_id: m[:burger].id } ], is_staff_meal: true, staff_meal_reason: "Kitchen lunch")
    api_post "/api/v1/orders/#{meal[:id]}/complete", {}, headers: h
    expect(response).to have_http_status(:ok), response.body
    expected = within(biz) { Shift.find(first[:id]).expected_cash }
    api_post "/api/v1/shifts/#{first[:id]}/close", { counted_cash_minor: expected }, headers: h
    expect(response).to have_http_status(:ok), response.body

    second = open_shift!
    refund!(burger, burger[:total_minor])                                # the first shift's sale, refunded in this one
    pay!(order!([ { product_id: m[:chai].id } ]))                        # Rs 92.80

    get "/api/v1/reports/shifts", params: { from: day.to_s, to: day.to_s }, headers: h
    expect(response).to have_http_status(:ok), response.body
    rows = json[:data].index_by { |r| r[:id] }
    expect(rows[first[:id]]).to include(sales_minor: 156_600, refunds_minor: 10_000, net_sales_minor: 146_600)
    expect(rows[second[:id]]).to include(status: "open", sales_minor: 9_280, refunds_minor: 52_200, net_sales_minor: 9_280 - 52_200)
    get "/api/v1/reports/overview", params: { from: day.to_s, to: day.to_s }, headers: h
    expect(rows.values.sum { |r| r[:net_sales_minor] }).to eq(json[:revenue_minor])

    # The Z report itself is left as it was: its net before refunds, and every rupee its drawer handed back.
    z = within(biz) { Shift.find(first[:id]).z_report }
    expect(z["sales"]).to include("net_minor" => 156_600)
    expect(z["refunds"]).to include("count" => 2, "amount_minor" => 30_000)

    get "/api/v1/reports/grand", params: { from: day.to_s, to: day.to_s }, headers: h
    expect(json[:shifts].map { |r| r[:net_sales_minor] }).to contain_exactly(146_600, 9_280 - 52_200)
  end
end
