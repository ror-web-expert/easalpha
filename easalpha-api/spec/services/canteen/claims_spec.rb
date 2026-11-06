require "rails_helper"

# Canteen::Claims after the 6 Nov review: a live claim is judged by the server clock with 15 minutes' grace (the
# kiosk's clock only stamps it); a claim a kiosk queued offline is judged at its scan time, within 72 hours; a meal
# belongs to the day its session's window opened, so a night shift past the business-day end is one meal; one meal per
# worker per session.
RSpec.describe Canteen::Claims, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:tz) { ActiveSupport::TimeZone[branch.time_zone] }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  def worker!(name, fp) = within(biz) { Employee.create!(name: name, base_salary_minor: 1, pay_frequency: "monthly", fingerprint_id: fp, fingerprint_enrolled: true) }

  def session!(name, from, to) = within(biz) { MealSession.create!(branch: branch, name: name, starts_at: from, ends_at: to) }

  # Publishes a one-dish plan (chai) for the session on that day; returns the dish.
  def plan!(session, date) = within(biz) { Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: session, date: date, items: [ { product_id: m[:chai].id } ])).items.first }

  # Lunch 12:00 to 15:00 with today's plan published; returns the session and the one dish.
  def lunch!
    s = session!("Lunch", "12:00", "15:00")
    [ s, plan!(s, within(biz) { branch.business_day_for(Time.current) }) ]
  end

  def claim!(**args) = within(biz) { described_class.claim!(branch: branch, actor: owner, **args) }

  it "judges a live claim by the server clock with 15 minutes' grace and refuses a stale one" do
    lunch = dish = nil
    travel_to tz.parse("2026-11-06 13:00") do
      lunch, dish = lunch!
      worker!("A", "FP-A")
      c = claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id, client_created_at: tz.parse("2026-11-06 12:55").iso8601)
      expect(c.scanned_at).to eq(tz.parse("2026-11-06 12:55"))
      # A kiosk clock hours out is ignored: the claim is stamped now and dated today.
      worker!("B", "FP-B")
      c = claim!(fingerprint_id: "FP-B", meal_plan_item_id: dish.id, client_created_at: tz.parse("2026-11-06 03:00").iso8601)
      expect(c.scanned_at).to eq(Time.current)
      expect(c.plan_date).to eq(branch.business_day_for(Time.current))
    end
    travel_to tz.parse("2026-11-06 15:10") do
      worker!("C", "FP-C")
      worker!("D", "FP-D")
      expect(claim!(fingerprint_id: "FP-C", meal_plan_item_id: dish.id, meal_session_id: lunch.id).status).to eq("claimed") # within the grace, by id
      expect(claim!(fingerprint_id: "FP-D", meal_plan_item_id: dish.id).status).to eq("claimed") # and found by the clock
    end
    travel_to tz.parse("2026-11-06 15:20") do
      worker!("E", "FP-E")
      expect { claim!(fingerprint_id: "FP-E", meal_plan_item_id: dish.id, meal_session_id: lunch.id) }.to raise_error(Api::Errors::Conflict, /not being served/)
      expect { claim!(fingerprint_id: "FP-E", meal_plan_item_id: dish.id) }.to raise_error(Api::Errors::Conflict, /No meal is being served/)
      # A live claim cannot backdate itself into the session with its own clock.
      expect { claim!(fingerprint_id: "FP-E", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: tz.parse("2026-11-06 13:00").iso8601) }.to raise_error(Api::Errors::Conflict, /not being served/)
    end
  end

  # contracts#0, canteen-payroll#0: the internet was down from 12:20 to 15:40; every queued claim came back
  # canteen.session_closed and the meals were never charged.
  it "records a meal served offline when its claim reaches the server after the session closed, within 72 hours" do
    lunch = dish = nil
    travel_to(tz.parse("2026-11-06 11:00")) { lunch, dish = lunch! }
    %w[A B C D E].each { |n| worker!(n, "FP-#{n}") }
    taken = tz.parse("2026-11-06 12:30")
    travel_to tz.parse("2026-11-06 15:40") do
      c = claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: taken.iso8601, token_label: "Q1-004", replay: true)
      expect(c).to have_attributes(status: "claimed", scanned_at: taken, plan_date: Date.new(2026, 11, 6), token_label: "Q1-004", worker_price_minor: 9_280)
      within(biz) do
        expect(c.order).to have_attributes(payment_status: "paid", business_day: Date.new(2026, 11, 6))
        expect(Customer.find(c.customer_id).balance_minor).to eq(9_280)
        expect(AuditLog.where(record_id: c.id, action: "create").last.after).to include("offline" => true)
      end
      # Still one meal a session: a second queued scan of the same finger is a second helping.
      expect { claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: (taken + 5.minutes).iso8601, replay: true) }
        .to raise_error(Api::Errors::Conflict, /already took Chai at 12:30/)
      # A scan outside every session is refused, with the time it was taken.
      expect { claim!(fingerprint_id: "FP-B", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: tz.parse("2026-11-06 10:30").iso8601, replay: true) }
        .to raise_error(Api::Errors::Conflict, "Lunch is not being served at 10:30")
      expect { claim!(fingerprint_id: "FP-B", meal_plan_item_id: dish.id, client_created_at: tz.parse("2026-11-06 10:30").iso8601, replay: true) }
        .to raise_error(Api::Errors::Conflict, "No meal is being served at 10:30")
      # The kiosk's grace holds for a replay too; a time ahead of the server is not believed.
      expect(claim!(fingerprint_id: "FP-C", meal_plan_item_id: dish.id, client_created_at: tz.parse("2026-11-06 15:12").iso8601, replay: true).plan_date).to eq(Date.new(2026, 11, 6))
      expect { claim!(fingerprint_id: "FP-D", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: tz.parse("2026-11-06 17:00").iso8601, replay: true) }
        .to raise_error(Api::Errors::Conflict, /not being served at 15:40/)
    end
    travel_to tz.parse("2026-11-09 12:31") do # more than 72 hours after the scan
      expect { claim!(fingerprint_id: "FP-E", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: taken.iso8601, replay: true) }
        .to raise_error(Api::Errors::Conflict, /more than 72 hours ago/)
    end
    travel_to tz.parse("2026-11-09 12:29") do
      expect(claim!(fingerprint_id: "FP-E", meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: taken.iso8601, replay: true).plan_date).to eq(Date.new(2026, 11, 6))
    end
  end

  # F6, canteen-payroll#3: Night 23:00 to 06:00 with the business day ending at 02:01. A worker ate at 23:30 and again
  # after 02:01 on the next day's plan; between 02:01 and the plan roll everyone else was told the menu was not published.
  it "keeps a night session that crosses the business-day end on the day it opened" do
    night = session!("Night", "23:00", "06:00")
    monday = Date.new(2026, 11, 9)
    tea = plan!(night, monday)
    worker!("A", "FP-A")
    worker!("B", "FP-B")
    first = travel_to(tz.parse("2026-11-09 23:30")) { claim!(fingerprint_id: "FP-A", meal_plan_item_id: tea.id) }
    expect(first).to have_attributes(plan_date: monday, token_label: "M-1")
    travel_to tz.parse("2026-11-10 03:00") do # Tuesday's business day, Monday's night shift
      expect(within(biz) { branch.business_day_for(Time.current) }).to eq(monday + 1)
      expect { claim!(fingerprint_id: "FP-A", meal_plan_item_id: tea.id) }.to raise_error(Api::Errors::Conflict, /already took Chai at 23:30/)
      second = claim!(fingerprint_id: "FP-B", meal_plan_item_id: tea.id)
      expect(second).to have_attributes(plan_date: monday, token_label: "M-2") # Monday's plan, Monday's token numbers
    end
    # A replay of a scan from inside the night, pushed after it, lands on the same night.
    worker!("C", "FP-C")
    late = travel_to(tz.parse("2026-11-10 09:00")) { claim!(fingerprint_id: "FP-C", meal_plan_item_id: tea.id, meal_session_id: night.id, client_created_at: tz.parse("2026-11-10 05:50").iso8601, replay: true) }
    expect(late).to have_attributes(plan_date: monday, token_label: "M-3")
    # Tuesday night is a new meal.
    tuesday = plan!(night, monday + 1)
    again = travel_to(tz.parse("2026-11-10 23:30")) { claim!(fingerprint_id: "FP-A", meal_plan_item_id: tuesday.id) }
    expect(again).to have_attributes(plan_date: monday + 1, token_label: "M-1")
  end

  # canteen-payroll#8: "Meals per worker in this session" took 2 and did nothing; the canteen rule is one meal.
  it "serves one meal per worker per session and refuses a session set to more" do
    travel_to tz.parse("2026-11-06 13:00") do
      lunch, dish = lunch!
      worker!("A", "FP-A")
      claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id)
      expect { claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id) }.to raise_error(Api::Errors::Conflict, /already took/)
      expect { within(biz) { lunch.update!(max_claims: 2) } }.to raise_error(ActiveRecord::RecordInvalid, /a worker takes one meal per session; add another session/)
      api_patch "/api/v1/canteen/sessions/#{lunch.id}", { max_claims: 2 }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(within(biz) { lunch.reload.max_claims }).to eq(1)
    end
  end

  # canteen-payroll#2: with manual lookup off a device could still put a meal on any worker by employee id.
  it "takes a device's claim by employee id only while manual lookup is on, and a queued one whatever the setting" do
    travel_to tz.parse("2026-11-06 13:00") do
      lunch, dish = lunch!
      a = worker!("A", "FP-A")
      b = worker!("B", "FP-B")
      api_patch "/api/v1/settings", { values: { "canteen.manual_lookup" => false } }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      kiosk = within(biz) { Device.create!(branch: branch, name: "Kiosk", kind: "kiosk", paired_at: Time.current, code: "Q1") }
      expect { within(biz) { described_class.claim!(branch: branch, device: kiosk, employee_id: a.id, meal_plan_item_id: dish.id) } }.to raise_error(Api::Errors::Forbidden, /Manual lookup is switched off/)
      expect(within(biz) { described_class.claim!(branch: branch, device: kiosk, fingerprint_id: "FP-A", meal_plan_item_id: dish.id) }.employee_id).to eq(a.id)
      queued = within(biz) { described_class.claim!(branch: branch, device: kiosk, employee_id: b.id, meal_plan_item_id: dish.id, meal_session_id: lunch.id, client_created_at: 5.minutes.ago.iso8601, replay: true) }
      expect(queued.employee_id).to eq(b.id)
    end
  end
end
