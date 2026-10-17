# 17 Oct 2026: Pro includes 10 tills (was 3) and Business includes unlimited tills (was 10; nil means unlimited).
# Only the till limit changes; the other limits, prices and features stay as stored.
class UpdatePlanTillLimits < ActiveRecord::Migration[8.1]
  TILLS = { "pro" => [ 3, 10 ], "business" => [ 10, nil ] }.freeze

  def up = apply(1)
  def down = apply(0)

  private

  def apply(to)
    TILLS.each do |code, values|
      row = select_one("SELECT id, limits FROM plans WHERE code = #{quote(code)}")
      next unless row
      limits = row["limits"].is_a?(String) ? JSON.parse(row["limits"]) : (row["limits"] || {})
      limits["tills"] = values[to]
      execute("UPDATE plans SET limits = #{quote(limits.to_json)}, updated_at = NOW() WHERE id = #{quote(row['id'])}")
    end
  end
end
