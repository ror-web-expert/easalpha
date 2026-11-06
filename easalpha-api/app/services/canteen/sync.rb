module Canteen
  # What a kiosk keeps on its own disk so a lost connection changes nothing at the counter: the sessions, the plans it
  # may serve next, every worker it may identify and the claims that decide "already taken" while it is offline.
  module Sync
    module_function

    def payload(branch, at: Time.current)
      dates = Sessions.open_dates(branch, at: at)
      # The kiosk picks the session from its clock (src/components/canteen/helpers.ts sessionAt and sessionDay, as
      # Sessions does): it needs the branch's clock and day end, and the plans of the days it may reach offline, the
      # next business day's too when it was published ahead.
      plan_dates = (dates + [ branch.business_day_for(at) + 1 ]).uniq
      {
        date: Sessions.service_date(branch, at: at), dates: dates, time_zone: branch.time_zone, day_end: branch.day_end_time.strftime("%H:%M"),
        sessions: MealSession.active.where(branch_id: branch.id).order(:sort_order, :starts_at).map { |s| CanteenSerializers.session(s) },
        plans: Plans.for_day(branch, plan_dates).select(&:published?).map { |p| CanteenSerializers.plan(p) },
        # Every worker whatever canteen.manual_lookup says: with no list the kiosk could name no finger offline. The
        # setting gates the name search only (CanteenController#workers, Claims).
        fingerprint_salt: branch.business_id,
        workers: Employee.active.includes(:department).order(:name).map { |e| CanteenSerializers.kiosk_worker(e) },
        claims: MealClaim.live.includes(:meal_session, :employee, meal_plan_item: :product).where(branch_id: branch.id, plan_date: dates).map { |c| CanteenSerializers.claim(c) }
      }
    end
  end
end
