module Canteen
  module Sessions
    module_function

    # How far outside a session's window the server still takes a claim: one queued just as the window closed, or a
    # kiosk clock a little off.
    GRACE = 15.minutes

    # The session being served at this moment at this branch, or nil between meals. With `grace`, a session that just
    # closed (or is about to open) still counts when none is open.
    def current(branch, at: Time.current, grace: 0)
      sessions = MealSession.active.where(branch_id: branch.id).order(:sort_order, :starts_at).to_a
      sessions.detect { |s| s.covers?(at, branch.time_zone) } || (grace.to_i.positive? ? sessions.detect { |s| s.covers?(at, branch.time_zone, grace: grace) } : nil)
    end

    # The day a meal taken at `at` in this session belongs to (its plan, its token numbers, the one-meal rule): the
    # business day of the moment the session's window opened. A night session 23:00 to 06:00 is one meal on the day it
    # opened, though the business day turns at 02:01 in the middle of it (6 Nov 2026 review, F6). Nil outside the window.
    def day_for(branch, session, at, grace: 0)
      start = session.occurrence_start(at, branch.time_zone, grace: grace)
      start && branch.business_day_for(start)
    end

    # The canteen's day now: the day of the session being served, else the business day. The kiosk, the counter and
    # the Today page read their plans and counts for it.
    def service_date(branch, at: Time.current)
      session = current(branch, at: at)
      (session && day_for(branch, session, at)) || branch.business_day_for(at)
    end

    # Days whose meals can still be taken or collected now: the business day and the day of every session open now,
    # within the grace. The counter's waiting tokens and the kiosk's "already taken" list come from these.
    def open_dates(branch, at: Time.current, grace: GRACE)
      days = MealSession.active.where(branch_id: branch.id).filter_map { |s| day_for(branch, s, at, grace: grace) }
      [ branch.business_day_for(at), *days ].uniq
    end

    DEFAULTS = [ [ "Breakfast", "07:00", "10:00" ], [ "Lunch", "12:00", "15:00" ], [ "Dinner", "19:00", "22:00" ] ].freeze

    # Three sessions a factory mess usually runs; the owner edits the times.
    def seed_defaults!(branch)
      return if MealSession.where(branch_id: branch.id).exists?
      DEFAULTS.each_with_index { |(name, s, e), i| MealSession.create!(branch: branch, name: name, starts_at: s, ends_at: e, sort_order: i) }
    end
  end
end
