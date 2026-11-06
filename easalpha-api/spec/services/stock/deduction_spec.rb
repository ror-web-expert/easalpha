require "rails_helper"

# Stock::Deduction keeps the ledger in step with a completed order that is reopened and edited (final round, 6 Nov):
# a lowered quantity gives stock back (stock#2, orders-money#4), Retry and the safety net never undo a correct sale
# after the recipe changed (stock#1), a raise on an earlier day's order lands on the day it was sold (stock#9), and a
# removed line gives its stock back even after a re-deduct failed (stock#8).
RSpec.describe Stock::Deduction, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:day) { today_for(biz) }
  let!(:stock) do
    within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      pcs = Unit.find_by!(code: "pcs")
      bun = StockItem.create!(name: "Bun", base_unit: pcs)
      tea = StockItem.create!(name: "Tea bag", base_unit: pcs)
      [ bun, tea ].each { |i| Stock::Posting.post!(Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [ { stock_item_id: i.id, quantity: 100, unit_cost_minor: 1_000 } ], actor: owner, branch: branch), actor: owner, posting_date: day - 5) }
      { kitchen: kitchen, bun: bun, tea: tea }
    end
  end

  def recipe!(product, item, quantity = 1)
    api_post "/api/v1/recipes", { product_id: product.id, name: product.name, lines: [ { stock_item_id: item.id, quantity: quantity } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  # on: an earlier business day for the sale (set before it is paid, since stock rows are insert-only).
  def paid!(lines, on: nil)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    within(biz) { Order.find(o[:id]).update_columns(business_day: on) } if on
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def reopen!(o)
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  def edit!(o, lines)
    api_patch "/api/v1/orders/#{o[:id]}", { lines: lines }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    json
  end

  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity).to_i }
  def live(o, item) = within(biz) { StockLedgerEntry.where(ref_table: "orders", ref_id: o[:id], stock_item_id: item.id, reversed_by_entry_id: nil, reverses_entry_id: nil).pluck(:quantity).map(&:to_i) }
  def by_day(item) = within(biz) { StockLedgerEntry.where(stock_item_id: item.id, kind: %w[sale sale_return]).group(:business_day).sum(:quantity).transform_values(&:to_i) }

  it "gives stock back when a reopened order's quantity is lowered, and the next completion leaves it there" do
    recipe!(m[:burger], stock[:bun])
    o = paid!([ { product_id: m[:burger].id, quantity: 3 } ])
    expect(level(stock[:bun])).to eq(97)
    reopen!(o)
    edited = edit!(o, [ { id: o[:items].first[:id], product_id: m[:burger].id, quantity: 1 } ])
    expect(level(stock[:bun])).to eq(99)
    expect(live(o, stock[:bun])).to eq([ -1 ])
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: o[:total_minor] - edited[:total_minor], method_code: "cash", reason: "two burgers off" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(level(stock[:bun])).to eq(99)
  end

  it "Retry and the safety net leave a sale alone after its recipe is edited or archived; a raise takes only the new portions at the new recipe" do
    recipe = recipe!(m[:burger], stock[:bun])
    o = paid!([ { product_id: m[:burger].id, quantity: 2 } ])
    expect(level(stock[:bun])).to eq(98)
    retry_deduction = lambda do
      api_post "/api/v1/stock/deduction_health/#{o[:id]}/retry", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
    end

    api_patch "/api/v1/recipes/#{recipe[:id]}", { lines: [ { stock_item_id: stock[:bun].id, quantity: 2 } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    retry_deduction.call
    expect(level(stock[:bun])).to eq(98)
    within(biz) do
      Order.find(o[:id]).update_columns(stock_deducted_at: nil) # as if the check at completion had been lost
      Stock::SafetyNet.sweep!
    end
    expect(level(stock[:bun])).to eq(98)

    api_delete = -> { delete "/api/v1/recipes/#{recipe[:id]}", headers: headers }
    api_delete.call
    expect(response).to have_http_status(:no_content)
    retry_deduction.call
    expect(level(stock[:bun])).to eq(98)
    expect(live(o, stock[:bun])).to eq([ -2 ])

    recipe!(m[:burger], stock[:bun], 2) # two buns a burger from now on
    reopen!(o)
    edit!(o, [ { id: o[:items].first[:id], product_id: m[:burger].id, quantity: 3 } ])
    expect(level(stock[:bun])).to eq(96) # the third burger at two buns; the first two keep their one each
    expect(live(o, stock[:bun])).to eq([ -4 ])
  end

  it "puts a raise on an earlier day's order on the day it was sold, and on today once that day is locked" do
    recipe!(m[:burger], stock[:bun])
    o = paid!([ { product_id: m[:burger].id, quantity: 1 } ], on: day - 2)
    expect(by_day(stock[:bun])).to eq({ day - 2 => -1 })
    reopen!(o)
    line = o[:items].first[:id]
    edit!(o, [ { id: line, product_id: m[:burger].id, quantity: 3 } ])
    expect(level(stock[:bun])).to eq(97)
    expect(by_day(stock[:bun])).to eq({ day - 2 => -3 })

    within(biz) { InventorySetting.current.update!(day_lock_date: day - 1) }
    edit!(o, [ { id: line, product_id: m[:burger].id, quantity: 4 } ])
    expect(level(stock[:bun])).to eq(96)
    expect(by_day(stock[:bun])).to eq({ day - 2 => -3, day => -1 })
  end

  it "returns a removed line's stock even after a failed re-deduct cleared the stamp" do
    recipe!(m[:burger], stock[:bun])
    recipe!(m[:chai], stock[:tea])
    o = paid!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ])
    expect([ level(stock[:bun]), level(stock[:tea]) ]).to eq([ 99, 99 ])
    burger = o[:items].find { |i| i[:name] == "Zinger Burger" }[:id]
    reopen!(o)
    allow(Stock::Ledger).to receive(:apply!).and_raise(StandardError, "database away")
    edit!(o, [ { id: burger, product_id: m[:burger].id, quantity: 2 }, { id: o[:items].find { |i| i[:id] != burger }[:id], product_id: m[:chai].id } ])
    allow(Stock::Ledger).to receive(:apply!).and_call_original
    within(biz) { expect(Order.find(o[:id]).stock_deducted_at).to be_nil }
    edit!(o, [ { id: burger, product_id: m[:burger].id, quantity: 2 } ]) # the chai comes off
    expect([ level(stock[:bun]), level(stock[:tea]) ]).to eq([ 98, 100 ])
    get "/api/v1/orders/#{o[:id]}", headers: headers
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: json[:due_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    within(biz) { Stock::SafetyNet.sweep! }
    expect([ level(stock[:bun]), level(stock[:tea]) ]).to eq([ 98, 100 ])
  end

  # B15: the status compared a time with a duration, so Deduction Health always said "Not running".
  it "reports the safety net as running after a recent sweep and not after a long silence" do
    within(biz) do
      Stock::SafetyNet.sweep!
      expect(Stock::SafetyNet.status[:running]).to be(true)
      SafetyNetRun.update_all(ran_at: 30.minutes.ago)
      expect(Stock::SafetyNet.status[:running]).to be(false)
    end
  end
end
