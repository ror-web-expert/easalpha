require "rails_helper"
require "fugit"

# CanteenPlansRollJob: a day with no plan for a session gets the session's latest published plan, published; a day
# that has one (even a draft) is left alone; each branch is rolled on its own business day, once; canteen.plans.auto_copy
# switches it off.
RSpec.describe CanteenPlansRollJob, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.order(:created_at).first } } # the signup branch, whatever a second one's uuid sorts as
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

  # canteen-payroll#7: one run at 04:00 Karachi time rolled each branch's business day of that moment, so a branch
  # whose day ends at 06:00 (or one in another zone) was still on yesterday, which had its plans, and rolled nothing.
  it "rolls each branch's own business day soon after it begins, once" do
    tz = ActiveSupport::TimeZone["Asia/Karachi"]
    mon = Date.new(2026, 11, 9)
    late = within(biz) { Branch.create!(name: "Night works", day_end_time: "06:00", time_zone: "Asia/Karachi") }
    main_lunch = session!("Lunch")
    late_lunch = within(biz) { MealSession.create!(branch: late, name: "Lunch", starts_at: "12:00", ends_at: "15:00") }
    plan!(main_lunch, mon - 1)
    within(biz) { Canteen::Plans.publish!(Canteen::Plans.save!(branch: late, session: late_lunch, date: mon - 1, items: [ { product_id: m[:chai].id } ])) }
    plans_on = ->(b, d) { within(biz) { MealPlan.where(branch_id: b.id, plan_date: d).pluck(:status) } }
    travel_to(tz.parse("2026-11-09 04:00")) { described_class.perform_now }
    expect(plans_on.call(branch, mon)).to eq([ "published" ])
    expect(plans_on.call(late, mon)).to eq([]) # its Monday has not begun
    travel_to(tz.parse("2026-11-09 06:15")) { described_class.perform_now }
    expect(plans_on.call(late, mon)).to eq([ "published" ])
    # Once a branch's day is rolled, a plan deleted for that day stays deleted (the canteen is closed tonight).
    within(biz) { MealPlan.find_by(branch_id: branch.id, plan_date: mon).destroy! }
    travel_to(tz.parse("2026-11-09 07:00")) { described_class.perform_now }
    expect(plans_on.call(branch, mon)).to eq([])
  end

  it "copies a session's latest published plan of the week before, so a day off does not leave the next day empty" do
    lunch, dinner = session!("Lunch"), session!("Dinner")
    plan!(lunch, today - 9)
    plan!(lunch, today - 2) # yesterday was a day off: no plan
    plan!(dinner, today - 8) # older than a week: not copied
    described_class.perform_now
    within(biz) do
      copy = MealPlan.find_by(meal_session_id: lunch.id, plan_date: today)
      expect(copy).to have_attributes(status: "published", notes: "Friday")
      expect(MealPlan.where(meal_session_id: dinner.id, plan_date: today)).to be_empty
    end
  end

  it "is scheduled often enough to catch every branch's day start" do
    schedule = YAML.load_file(Rails.root.join("config/recurring.yml")).dig("production", "canteen_plans_roll", "schedule")
    expect(Fugit.parse(schedule).rough_frequency).to be <= 1.hour.to_i
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
