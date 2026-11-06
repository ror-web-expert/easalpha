require "rails_helper"

# Stock::SafetyNet and Stock::Deduction after the 6 Nov review: an order whose products have no recipe is checked
# once and drops out (item 10); raising a quantity on a sent order keeps the line's consumables; a re-deduct that
# fails clears the stamp so the net retries, at the new quantity.
RSpec.describe Stock::SafetyNet, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def paid_order(product, quantity: 1)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: product.id, quantity: quantity } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity) }

  it "checks an order with no recipe once: three sweeps, one audit row, nothing pending" do
    o = paid_order(m[:chai])
    within(biz) do
      order = Order.find(o[:id])
      expect(order.stock_deducted_at).to be_present
      order.update_columns(stock_deducted_at: nil) # as if the check at completion had been lost
      3.times { described_class.sweep! }
      expect(DeductionAudit.where(order_id: order.id).pluck(:status)).to eq([ "missing" ])
      expect(described_class.status[:pending]).to eq(0)
      expect(order.reload.stock_deducted_at).to be_present
    end
  end

  it "keeps a raised line's consumables on re-deduct, and retries a failed re-deduct at the new quantity" do
    buns = boxes = nil
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      pcs = Unit.find_by!(code: "pcs")
      buns = StockItem.create!(name: "Bun", base_unit: pcs)
      boxes = StockItem.create!(name: "Box", base_unit: pcs, is_packaging: true)
      [ buns, boxes ].each do |i|
        Stock::Posting.post!(Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [ { stock_item_id: i.id, quantity: 100, unit_cost_minor: 1_000 } ], actor: owner, branch: branch), actor: owner)
      end
      OrderTypeConsumable.create!(product: m[:burger], order_type: "walk_in", stock_item: boxes, quantity: 1, unit: pcs)
    end
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Burger", lines: [ { stock_item_id: buns.id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = paid_order(m[:burger])
    expect([ level(buns), level(boxes) ]).to eq([ 99, 99 ])
    line = o[:items].first[:id]
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line, product_id: m[:burger].id, quantity: 3 } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect([ level(buns), level(boxes) ]).to eq([ 97, 97 ]) # the box went with the line, at the new quantity

    allow(Stock::Ledger).to receive(:apply!).and_raise(StandardError, "database away")
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line, product_id: m[:burger].id, quantity: 4 } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect([ level(buns), level(boxes) ]).to eq([ 97, 97 ])
    within(biz) do
      expect(Order.find(o[:id]).stock_deducted_at).to be_nil
      expect(DeductionAudit.where(order_id: o[:id]).order(:checked_at).last.status).to eq("error")
    end
    # A reopened order is open until it is paid again; the completion's own deduction fails too, so the net has it.
    get "/api/v1/orders/#{o[:id]}", headers: headers
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: json[:due_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect([ level(buns), level(boxes) ]).to eq([ 97, 97 ])
    within(biz) do
      expect(Order.find(o[:id])).to have_attributes(status: "paid", stock_deducted_at: nil)
      expect(described_class.candidates.pluck(:id)).to eq([ o[:id] ])
    end
    allow(Stock::Ledger).to receive(:apply!).and_call_original
    within(biz) { described_class.sweep! }
    expect([ level(buns), level(boxes) ]).to eq([ 96, 96 ])
    within(biz) do
      expect(Order.find(o[:id]).stock_deducted_at).to be_present
      expect(described_class.candidates.count).to eq(0)
    end
  end
end
