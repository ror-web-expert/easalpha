# Screen walk of 7 Nov 2026 (L2): a member put on the system Rider role from Staff got no rider profile, so the rider
# app answered 403 rider.none to every list. Riders::Profile.ensure_for! now makes one on every way onto the role; this
# gives one to the active Rider members already without, as it would: a rider added without a login on the member's
# phone becomes theirs, else a new rider with the login's name and phone on the member's one branch (none, so every
# branch lists it, for a member on all branches or several). A profile the owner deactivated is left as it is.
#
# A migration so it runs once on every database with the code. Not undone on rollback: the riders may carry deliveries.
class RiderProfilesForRiderMembers < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      WITH needing AS (
        SELECT m.id AS membership_id, m.business_id, u.phone
        FROM memberships m
        JOIN roles r ON r.id = m.role_id AND r.system_key = 'rider'
        JOIN users u ON u.id = m.user_id
        WHERE m.status = 'active' AND NOT EXISTS (SELECT 1 FROM riders x WHERE x.membership_id = m.id)
      ), taken AS (
        SELECT DISTINCT ON (n.membership_id) n.membership_id, x.id AS rider_id
        FROM needing n
        JOIN riders x ON x.business_id = n.business_id AND x.phone = n.phone AND x.membership_id IS NULL
                     AND x.active AND x.archived_at IS NULL AND NOT x.temporary
        ORDER BY n.membership_id, x.created_at
      )
      UPDATE riders SET membership_id = taken.membership_id, updated_at = now() FROM taken WHERE riders.id = taken.rider_id
    SQL

    execute <<~SQL
      INSERT INTO riders (id, business_id, branch_id, membership_id, name, phone, created_at, updated_at)
      SELECT gen_random_uuid(), m.business_id,
             CASE WHEN NOT m.all_branches AND cardinality(m.branch_ids) = 1 THEN m.branch_ids[1] END,
             m.id, u.name, u.phone, now(), now()
      FROM memberships m
      JOIN roles r ON r.id = m.role_id AND r.system_key = 'rider'
      JOIN users u ON u.id = m.user_id
      WHERE m.status = 'active' AND NOT EXISTS (SELECT 1 FROM riders x WHERE x.membership_id = m.id)
    SQL
  end

  def down
    # Nothing to undo: see above.
  end
end
