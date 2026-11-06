require "rails_helper"

# CanteenPlansRollJob: a day with no plan for a session gets yesterday's published plan, published; a day that has
# one (even a draft) is left alone; canteen.plans.auto_copy switches it off.
RSpec.describe CanteenPlansRollJob, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }

  before do
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  def session!(name) = within(biz) { MealSession.create!(branch: branch, name: name, starts_at: "12:00", ends_at: "15:00") }

  def plan!(session, date, publish: true)
    within(biz) do
      p = Canteen::Plans.save!(branch: branch, session: session, date: date, notes: "Friday", items: [ { product_id: m[:burger].id, planned_qty: 80, worker_price_minor: 20_000 }, { product_id: m[:chai].id } ])
      publish ? Canteen::Plans.publish!(p) : p
    end
  end

  it "publishes today's plans from yesterday's published ones, once, and leaves a draft alone" do
    lunch, dinner, tea = session!("Lunch"), session!("Dinner"), session!("Tea")
    plan!(lunch, today - 1)
    plan!(dinner, today - 1, publish: false)
    plan!(tea, today - 1)
    plan!(tea, today, publish: false)
    described_class.perform_now
    within(biz) do
      copy = MealPlan.find_by(meal_session_id: lunch.id, plan_date: today)
      expect(copy).to have_attributes(status: "published", notes: "Friday")
      expect(copy.items.map { |i| [ i.product_id, i.planned_qty, i.worker_price_minor, i.claims_count ] }).to eq([ [ m[:burger].id, 80, 20_000, 0 ], [ m[:chai].id, nil, nil, 0 ] ])
      expect(MealPlan.find_by(meal_session_id: dinner.id, plan_date: today)).to be_nil # yesterday's was never published
      expect(MealPlan.find_by(meal_session_id: tea.id, plan_date: today).status).to eq("draft")
    end
    described_class.perform_now
    within(biz) { expect(MealPlan.where(plan_date: today).count).to eq(2) }
    get "/api/v1/canteen/today", headers: headers
    expect(json[:plans].map { |p| [ p[:session][:name], p[:status] ] }).to include([ "Lunch", "published" ])
  end

  it "does nothing when canteen.plans.auto_copy is off" do
    lunch = session!("Lunch")
    plan!(lunch, today - 1)
    api_patch "/api/v1/settings", { values: { "canteen.plans.auto_copy" => false } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    described_class.perform_now
    within(biz) { expect(MealPlan.where(plan_date: today)).to be_empty }
  end
end
