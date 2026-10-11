# SPEC "Staff, attendance and payroll" and "Riders": the attendance rules engine, the scan log and fingerprint
# enrolment, temporary riders with a lifetime, day-end settlements for the Cashier Till report, payroll snapshots.
class Phase6People < ActiveRecord::Migration[8.0]
  def up
    change_table :attendance_rules do |t|
      t.boolean :rules_enabled, null: false, default: true
      t.integer :late_after_minutes
      t.integer :half_day_after_minutes
      t.integer :absent_after_minutes
      t.boolean :overtime_enabled, null: false, default: false
      t.bigint :overtime_rate_minor_per_hour, null: false, default: 0
      t.boolean :no_scan_counts_absent, null: false, default: true
      t.integer :free_lates, null: false, default: 0
      t.integer :free_half_days, null: false, default: 0
      t.integer :free_absents, null: false, default: 0
      t.string :late_penalty, null: false, default: "fine_only"
      t.string :half_day_penalty, null: false, default: "lose_day"
      t.string :absent_penalty, null: false, default: "lose_day"
      t.bigint :half_day_fine_minor, null: false, default: 0
      t.bigint :absent_fine_minor, null: false, default: 0
      t.bigint :fine_cap_minor
      t.integer :checkout_gap_minutes, null: false, default: 5
      t.integer :fixed_divisor, null: false, default: 26
    end
    add_check_constraint :attendance_rules, "late_penalty IN ('fine_only','lose_day','both','none') AND half_day_penalty IN ('fine_only','lose_day','both','none') AND absent_penalty IN ('fine_only','lose_day','both','none')", name: "attendance_rules_penalty_check"

    change_table :attendances do |t|
      t.integer :overtime_minutes, null: false, default: 0
      t.boolean :missing_punch, null: false, default: false
      t.boolean :auto_closed, null: false, default: false
      t.boolean :lost_day, null: false, default: false
    end
    remove_check_constraint :attendances, name: "attendances_status_check"
    add_check_constraint :attendances, "status IN ('present','late','half_day','absent','leave','holiday','weekly_off')", name: "attendances_status_check"

    create_table :attendance_scans, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :employee_id
      t.uuid :attendance_id
      t.uuid :device_id
      t.string :fingerprint_id
      t.datetime :scanned_at, null: false
      t.string :result, null: false
      t.string :note
      t.timestamps
    end
    add_index :attendance_scans, [ :business_id, :scanned_at ]
    add_index :attendance_scans, :employee_id
    add_check_constraint :attendance_scans, "result IN ('check_in','check_out','already_marked','rejected','unknown','manual_out','auto_close')", name: "attendance_scans_result_check"

    add_column :employees, :fingerprint_id, :string
    add_column :employees, :fingerprint_enrolled_at, :datetime
    add_column :employees, :fingerprint_revoked_at, :datetime
    add_index :employees, [ :business_id, :fingerprint_id ], unique: true, where: "fingerprint_id IS NOT NULL"

    change_table :riders do |t|
      t.boolean :temporary, null: false, default: false
      t.string :lifetime_kind
      t.integer :lifetime_value
      t.datetime :expires_at
      t.integer :orders_allowed
      t.integer :orders_used, null: false, default: 0
      t.jsonb :permissions, null: false, default: []
      t.uuid :created_by_membership_id
    end
    add_check_constraint :riders, "lifetime_kind IS NULL OR lifetime_kind IN ('one_order','n_orders','rest_of_today','n_hours')", name: "riders_lifetime_kind_check"

    add_column :payroll_runs, :settings_snapshot, :jsonb, null: false, default: {}

    create_table :day_end_settlements, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id, null: false
      t.date :business_day, null: false
      t.uuid :settled_by_membership_id
      t.integer :shifts_count, null: false, default: 0
      t.bigint :amount_minor, null: false, default: 0
      t.jsonb :detail, null: false, default: {}
      t.text :note
      t.timestamps
    end
    add_index :day_end_settlements, [ :business_id, :branch_id, :business_day ]

    EasAlpha::Rls.apply!(%w[attendance_scans day_end_settlements])
  end

  def down
    drop_table :day_end_settlements
    remove_column :payroll_runs, :settings_snapshot
    %i[temporary lifetime_kind lifetime_value expires_at orders_allowed orders_used permissions created_by_membership_id].each { |c| remove_column :riders, c }
    remove_index :employees, [ :business_id, :fingerprint_id ]
    %i[fingerprint_id fingerprint_enrolled_at fingerprint_revoked_at].each { |c| remove_column :employees, c }
    drop_table :attendance_scans
    %i[overtime_minutes missing_punch auto_closed lost_day].each { |c| remove_column :attendances, c }
    %i[rules_enabled late_after_minutes half_day_after_minutes absent_after_minutes overtime_enabled overtime_rate_minor_per_hour no_scan_counts_absent free_lates free_half_days free_absents late_penalty half_day_penalty absent_penalty half_day_fine_minor absent_fine_minor fine_cap_minor checkout_gap_minutes fixed_divisor].each { |c| remove_column :attendance_rules, c }
  end
end
