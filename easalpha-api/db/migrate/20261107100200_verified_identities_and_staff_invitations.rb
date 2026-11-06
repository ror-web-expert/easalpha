# QA of 6 Nov 2026, P1: a stranger put someone's phone or email on their own account at sign-up, and an owner adding
# that person as staff linked the stranger's account into the business. A phone or email now counts for linking only
# once its holder proved it with a code sent to it; anything else becomes an invitation the real person accepts by
# proving it (staff_invitations). email_codes carries codes sent by email (password reset, confirming an email,
# accepting an invitation), as otp_codes does for phones.
#
# Existing data: a phone counts as proven when a code sent to it was used (sign-up, phone login or confirming a new
# phone on /me) since its account was made; otp_codes keeps every code, used or not. No email was ever confirmed, so no
# email counts: linking an existing account by email becomes an invitation until its holder confirms it (a password
# reset or the invitation itself does). Nobody loses a membership or a login they have.
class VerifiedIdentitiesAndStaffInvitations < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :phone_verified_at, :datetime
    add_column :users, :email_verified_at, :datetime

    create_table :email_codes, id: :uuid do |t|
      t.string :email, null: false
      t.string :purpose, null: false
      t.string :code_digest, null: false
      t.datetime :expires_at, null: false
      t.integer :attempts, null: false, default: 0
      t.datetime :consumed_at
      t.timestamps
    end
    add_index :email_codes, %i[email purpose]

    create_table :staff_invitations, id: :uuid do |t|
      t.uuid :business_id, null: false
      t.uuid :role_id, null: false
      t.uuid :rider_id
      t.uuid :invited_by_membership_id
      t.string :name, null: false
      t.string :phone
      t.string :email
      t.string :staff_type, null: false
      t.string :cashier_role
      t.boolean :all_branches, null: false, default: true
      t.uuid :branch_ids, array: true, null: false, default: []
      t.string :pin_digest
      t.string :pin_lookup
      t.string :status, null: false, default: "pending"
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.uuid :accepted_by_user_id
      t.uuid :membership_id
      t.timestamps
    end
    add_index :staff_invitations, :business_id
    add_index :staff_invitations, :phone, where: "status = 'pending'"
    add_index :staff_invitations, :email, where: "status = 'pending'"
    add_check_constraint :staff_invitations, "status IN ('pending', 'accepted', 'cancelled')", name: "staff_invitations_status_check"

    backfill
  end

  # Phones proven before this migration: a sign-up, login or phone-confirmation code used since the login was made.
  def backfill
    # A sign-up code is used a moment before its account is made, hence the hour of slack.
    execute <<~SQL
      UPDATE users u SET phone_verified_at = proof.at
      FROM (
        SELECT holder.id AS user_id, MIN(o.consumed_at) AS at
        FROM users holder JOIN otp_codes o ON o.phone = holder.phone
        WHERE o.consumed_at IS NOT NULL AND o.purpose IN ('signup', 'login', 'verify_phone')
          AND o.consumed_at >= holder.created_at - interval '1 hour'
        GROUP BY holder.id
      ) proof
      WHERE u.id = proof.user_id
    SQL
  end

  def down
    drop_table :staff_invitations
    drop_table :email_codes
    remove_column :users, :email_verified_at
    remove_column :users, :phone_verified_at
  end
end
