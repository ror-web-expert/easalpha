module Canteen
  # Meals a kiosk took while offline that the server refused when they arrived (Sync::Push rejects them as a second
  # helping, a closed session, an unknown finger...). The worker has the food and the token, but nothing is on their
  # account, so they stay listed for a canteen manager until resolved (6 Nov 2026 review, R19).
  module Refused
    module_function

    LIMIT = 50
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

    def scope(branch) = SyncRejection.open.where(branch_id: branch.id, record_type: "meal_claim")

    # The open refusals at this branch, newest first, named from the records the claim pointed at. The payload is what
    # the kiosk sent, so an id is looked up only when it is a UUID.
    def list(branch, limit: LIMIT)
      rows = scope(branch).order(created_at: :desc).limit(limit).to_a
      claims = rows.to_h { |r| [ r.id, r.payload["payload"].is_a?(Hash) ? r.payload["payload"] : {} ] }
      ids = ->(key) { claims.values.map { |p| p[key].to_s }.select { |v| v.match?(UUID) }.uniq }
      employees = Employee.where(id: ids.call("employee_id")).index_by(&:id)
      # An archived or revoked worker may still carry the same reader id: the active, enrolled one sorts last and wins.
      fingers = Employee.where(fingerprint_id: claims.values.filter_map { |p| p["fingerprint_id"].presence&.to_s })
                        .order(Arel.sql("employees.archived_at IS NULL, employees.fingerprint_revoked_at IS NULL")).index_by(&:fingerprint_id)
      items = MealPlanItem.includes(:product).where(id: ids.call("meal_plan_item_id")).index_by(&:id)
      sessions = MealSession.where(id: ids.call("meal_session_id")).index_by(&:id)
      devices = Device.where(id: rows.map(&:device_id)).index_by(&:id)
      rows.map do |r|
        p = claims[r.id]
        e = employees[p["employee_id"]] || fingers[p["fingerprint_id"]]
        device = devices[r.device_id]
        { id: r.id, record_id: r.record_id, code: r.code, message: r.message, refused_at: r.created_at, taken_at: time(p["client_created_at"]), token_label: p["token_label"],
          employee_id: e&.id, employee_name: e&.name, fingerprint_id: p["fingerprint_id"], dish: items[p["meal_plan_item_id"]]&.product&.name,
          session: sessions[p["meal_session_id"]]&.name, device_id: r.device_id, device: device&.code.presence || device&.name }
      end
    end

    # "fixed" when the manager put the meal on the worker's account by hand, "dismissed" when it is let go.
    def resolve!(branch, id, by:, resolution:)
      r = scope(branch).find(id)
      r.update!(resolved_at: Time.current, resolved_by_membership_id: by.id, resolution: resolution.to_s.presence_in(%w[fixed dismissed]) || "dismissed")
      r
    end

    def time(value)
      value.present? ? Time.zone.iso8601(value.to_s) : nil
    rescue ArgumentError
      nil
    end
  end
end
