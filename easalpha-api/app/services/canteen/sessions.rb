module Canteen
  module Sessions
    module_function

    # The session being served at this moment at this branch, or nil between meals. With `grace`, a session that just
    # closed (or is about to open) still counts when none is open.
    def current(branch, at: Time.current, grace: 0)
      sessions = MealSession.active.where(branch_id: branch.id).order(:sort_order, :starts_at).to_a
      sessions.detect { |s| s.covers?(at, branch.time_zone) } || (grace.to_i.positive? ? sessions.detect { |s| s.covers?(at, branch.time_zone, grace: grace) } : nil)
    end

    DEFAULTS = [ [ "Breakfast", "07:00", "10:00" ], [ "Lunch", "12:00", "15:00" ], [ "Dinner", "19:00", "22:00" ] ].freeze

    # Three sessions a factory mess usually runs; the owner edits the times.
    def seed_defaults!(branch)
      return if MealSession.where(branch_id: branch.id).exists?
      DEFAULTS.each_with_index { |(name, s, e), i| MealSession.create!(branch: branch, name: name, starts_at: s, ends_at: e, sort_order: i) }
    end
  end
end
