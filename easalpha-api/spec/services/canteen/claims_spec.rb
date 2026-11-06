require "rails_helper"

# Canteen::Claims after the 6 Nov review: the session window is judged by the server clock with 15 minutes' grace,
# a stale session is refused, the kiosk's clock only decorates the claim, and the session's max_claims is enforced.
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

  # Lunch 12:00 to 15:00 with today's plan published; returns the session and the one dish.
  def lunch!(max_claims: 1)
    within(biz) do
      s = MealSession.create!(branch: branch, name: "Lunch", starts_at: "12:00", ends_at: "15:00", max_claims: max_claims)
      plan = Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: s, date: branch.business_day_for(Time.current), items: [ { product_id: m[:chai].id } ]))
      [ s, plan.items.first ]
    end
  end

  def claim!(**args) = within(biz) { described_class.claim!(branch: branch, actor: owner, **args) }

  it "judges the session by the server clock with 15 minutes' grace and refuses a stale one" do
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
    end
  end

  it "enforces max_claims: a second helping is refused at one, and the one-per-session index holds it there" do
    travel_to tz.parse("2026-11-06 13:00") do
      lunch, dish = lunch!(max_claims: 1)
      worker!("A", "FP-A")
      claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id)
      expect { claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id) }.to raise_error(Api::Errors::Conflict, /already took/)
      within(biz) { lunch.update!(max_claims: 2) }
      expect { claim!(fingerprint_id: "FP-A", meal_plan_item_id: dish.id) }.to raise_error(Api::Errors::Conflict, /already took/)
      expect(within(biz) { MealClaim.live.where(employee_id: Employee.find_by(fingerprint_id: "FP-A").id).count }).to eq(1)
    end
  end
end
