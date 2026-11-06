module Canteen
  # What a kiosk keeps on its own disk so a lost connection changes nothing at the counter: the sessions, today's plans,
  # every worker it may identify and today's claims (for the "already taken" rule while the hub is unreachable).
  module Sync
    module_function

    def payload(branch, date: nil)
      date ||= branch.business_day_for(Time.current)
      # The worker list (name and fingerprint id, never a phone or CNIC) goes out only while manual lookup is on;
      # otherwise the kiosk identifies a finger through the server (GET /canteen/lookup, or the claim itself).
      workers = Current.business.setting("canteen.manual_lookup") == false ? [] : Employee.active.includes(:department).order(:name).map { |e| CanteenSerializers.kiosk_worker(e) }
      {
        date: date,
        sessions: MealSession.active.where(branch_id: branch.id).order(:sort_order, :starts_at).map { |s| CanteenSerializers.session(s) },
        plans: Plans.for_day(branch, date).select(&:published?).map { |p| CanteenSerializers.plan(p) },
        workers: workers,
        claims: MealClaim.live.includes(:meal_session, :employee, meal_plan_item: :product).where(branch_id: branch.id, plan_date: date).map { |c| CanteenSerializers.claim(c) }
      }
    end
  end
end
