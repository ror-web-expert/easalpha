# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_17_151000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "account_entries", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "payment_account_id", null: false
    t.date "business_day", null: false
    t.string "kind", null: false
    t.bigint "amount_minor", null: false
    t.string "ref_table"
    t.uuid "ref_id"
    t.string "description"
    t.uuid "by_membership_id"
    t.uuid "shift_id"
    t.uuid "verified_by_membership_id"
    t.datetime "verified_at"
    t.uuid "reversed_by_entry_id"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "payment_account_id", "business_day"], name: "idx_on_business_id_payment_account_id_business_day_04b5deec7e"
    t.index ["business_id", "ref_table", "ref_id"], name: "index_account_entries_on_business_id_and_ref_table_and_ref_id"
    t.index ["business_id"], name: "index_account_entries_on_business_id"
    t.index ["payment_account_id"], name: "index_account_entries_on_payment_account_id"
    t.check_constraint "kind::text = ANY (ARRAY['order_payment'::character varying, 'refund'::character varying, 'expense'::character varying, 'supplier_payment'::character varying, 'customer_payment'::character varying, 'customer_refund'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying, 'deposit'::character varying, 'withdrawal'::character varying, 'adjustment'::character varying, 'rider_float'::character varying, 'opening'::character varying, 'closing'::character varying]::text[])", name: "account_entries_kind_check"
  end

  create_table "active_storage_attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.uuid "record_id", null: false
    t.uuid "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "advances", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "employee_id", null: false
    t.integer "number", null: false
    t.bigint "amount_minor", null: false
    t.bigint "outstanding_minor", default: 0, null: false
    t.bigint "installment_minor"
    t.string "reason"
    t.string "status", default: "pending", null: false
    t.date "requested_on", null: false
    t.uuid "approved_by_membership_id"
    t.uuid "payment_account_id"
    t.uuid "expense_id"
    t.datetime "paid_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "number"], name: "index_advances_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_advances_on_business_id"
    t.index ["employee_id"], name: "index_advances_on_employee_id"
    t.check_constraint "status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'paid'::character varying, 'repaid'::character varying]::text[])", name: "advances_status_check"
  end

  create_table "aggregator_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "provider", null: false
    t.string "external_id", null: false
    t.string "event", null: false
    t.jsonb "payload", default: {}, null: false
    t.string "status", default: "received", null: false
    t.uuid "order_id"
    t.string "error"
    t.datetime "received_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_aggregator_events_on_branch_id"
    t.index ["business_id", "provider", "external_id", "event"], name: "idx_aggregator_events_unique", unique: true
    t.index ["business_id"], name: "index_aggregator_events_on_business_id"
  end

  create_table "ai_insights", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "kind", null: false
    t.date "from_date"
    t.date "to_date"
    t.jsonb "payload", default: {}, null: false
    t.string "engine", default: "rules", null: false
    t.datetime "generated_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "kind", "generated_at"], name: "index_ai_insights_on_business_id_and_kind_and_generated_at"
    t.index ["business_id"], name: "index_ai_insights_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['pricing'::character varying, 'stock_forecast'::character varying]::text[])", name: "ai_insights_kind_check"
  end

  create_table "attendance_rules", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "employee_id"
    t.time "shift_start", default: "2000-01-01 10:00:00", null: false
    t.time "shift_end", default: "2000-01-01 22:00:00", null: false
    t.integer "grace_minutes", default: 15, null: false
    t.bigint "late_fine_minor", default: 0, null: false
    t.integer "late_fine_after_minutes", default: 30, null: false
    t.string "absent_rule", default: "calendar_days", null: false
    t.integer "working_days", default: [1, 2, 3, 4, 5, 6], null: false, array: true
    t.boolean "require_fingerprint_to_close_shift", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "rules_enabled", default: true, null: false
    t.integer "late_after_minutes"
    t.integer "half_day_after_minutes"
    t.integer "absent_after_minutes"
    t.boolean "overtime_enabled", default: false, null: false
    t.bigint "overtime_rate_minor_per_hour", default: 0, null: false
    t.boolean "no_scan_counts_absent", default: true, null: false
    t.integer "free_lates", default: 0, null: false
    t.integer "free_half_days", default: 0, null: false
    t.integer "free_absents", default: 0, null: false
    t.string "late_penalty", default: "fine_only", null: false
    t.string "half_day_penalty", default: "lose_day", null: false
    t.string "absent_penalty", default: "lose_day", null: false
    t.bigint "half_day_fine_minor", default: 0, null: false
    t.bigint "absent_fine_minor", default: 0, null: false
    t.bigint "fine_cap_minor"
    t.integer "checkout_gap_minutes", default: 5, null: false
    t.integer "fixed_divisor", default: 26, null: false
    t.index ["business_id", "employee_id"], name: "idx_attendance_rules_unique", unique: true, where: "(employee_id IS NOT NULL)"
    t.index ["business_id"], name: "index_attendance_rules_on_business_id"
    t.index ["employee_id"], name: "index_attendance_rules_on_employee_id"
    t.check_constraint "(late_penalty::text = ANY (ARRAY['fine_only'::character varying, 'lose_day'::character varying, 'both'::character varying, 'none'::character varying]::text[])) AND (half_day_penalty::text = ANY (ARRAY['fine_only'::character varying, 'lose_day'::character varying, 'both'::character varying, 'none'::character varying]::text[])) AND (absent_penalty::text = ANY (ARRAY['fine_only'::character varying, 'lose_day'::character varying, 'both'::character varying, 'none'::character varying]::text[]))", name: "attendance_rules_penalty_check"
    t.check_constraint "absent_rule::text = ANY (ARRAY['calendar_days'::character varying, 'fixed_26'::character varying]::text[])", name: "attendance_rules_absent_check"
  end

  create_table "attendance_scans", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "employee_id"
    t.uuid "attendance_id"
    t.uuid "device_id"
    t.string "fingerprint_id"
    t.datetime "scanned_at", null: false
    t.string "result", null: false
    t.string "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "scanned_at"], name: "index_attendance_scans_on_business_id_and_scanned_at"
    t.index ["business_id"], name: "index_attendance_scans_on_business_id"
    t.index ["employee_id"], name: "index_attendance_scans_on_employee_id"
    t.check_constraint "result::text = ANY (ARRAY['check_in'::character varying, 'check_out'::character varying, 'already_marked'::character varying, 'rejected'::character varying, 'unknown'::character varying, 'manual_out'::character varying, 'auto_close'::character varying]::text[])", name: "attendance_scans_result_check"
  end

  create_table "attendances", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "employee_id", null: false
    t.date "business_day", null: false
    t.datetime "checked_in_at"
    t.datetime "checked_out_at"
    t.string "source", default: "manual", null: false
    t.integer "late_minutes", default: 0, null: false
    t.integer "worked_minutes", default: 0, null: false
    t.bigint "fine_minor", default: 0, null: false
    t.string "status", default: "present", null: false
    t.string "selfie_key"
    t.text "note"
    t.uuid "marked_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "overtime_minutes", default: 0, null: false
    t.boolean "missing_punch", default: false, null: false
    t.boolean "auto_closed", default: false, null: false
    t.boolean "lost_day", default: false, null: false
    t.index ["branch_id"], name: "index_attendances_on_branch_id"
    t.index ["business_id"], name: "index_attendances_on_business_id"
    t.index ["employee_id", "business_day"], name: "index_attendances_on_employee_id_and_business_day", unique: true
    t.index ["employee_id"], name: "index_attendances_on_employee_id"
    t.check_constraint "source::text = ANY (ARRAY['fingerprint'::character varying, 'selfie'::character varying, 'manual'::character varying, 'pin'::character varying]::text[])", name: "attendances_source_check"
    t.check_constraint "status::text = ANY (ARRAY['present'::character varying, 'late'::character varying, 'half_day'::character varying, 'absent'::character varying, 'leave'::character varying, 'holiday'::character varying, 'weekly_off'::character varying]::text[])", name: "attendances_status_check"
  end

  create_table "audit_logs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id"
    t.uuid "branch_id"
    t.uuid "user_id"
    t.uuid "device_id"
    t.uuid "approved_by_user_id"
    t.string "action", null: false
    t.string "table_name"
    t.uuid "record_id"
    t.jsonb "before"
    t.jsonb "after"
    t.string "ip"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "action", "occurred_at"], name: "index_audit_logs_on_business_id_and_action_and_occurred_at"
    t.index ["business_id", "occurred_at"], name: "index_audit_logs_on_business_id_and_occurred_at"
    t.index ["business_id", "table_name", "record_id"], name: "index_audit_logs_on_business_id_and_table_name_and_record_id"
    t.index ["business_id", "user_id", "occurred_at"], name: "index_audit_logs_on_business_id_and_user_id_and_occurred_at"
  end

  create_table "bill_runs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.date "period_from", null: false
    t.date "period_to", null: false
    t.date "due_on"
    t.string "trigger", default: "manual", null: false
    t.string "status", default: "running", null: false
    t.integer "customers_count", default: 0, null: false
    t.integer "sent_count", default: 0, null: false
    t.integer "failed_count", default: 0, null: false
    t.integer "skipped_count", default: 0, null: false
    t.jsonb "results", default: [], null: false
    t.uuid "by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "period_from", "period_to"], name: "index_bill_runs_one_auto_per_period", unique: true, where: "((trigger)::text = 'auto'::text)"
    t.index ["business_id"], name: "index_bill_runs_on_business_id"
    t.check_constraint "status::text = ANY (ARRAY['running'::character varying, 'done'::character varying]::text[])", name: "bill_runs_status_check"
    t.check_constraint "trigger::text = ANY (ARRAY['auto'::character varying, 'manual'::character varying]::text[])", name: "bill_runs_trigger_check"
  end

  create_table "branches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "code", null: false
    t.string "address"
    t.string "city"
    t.string "phone"
    t.string "time_zone", default: "Asia/Karachi", null: false
    t.time "day_end_time", default: "2000-01-01 02:01:00", null: false
    t.jsonb "tax_registration", default: {}, null: false
    t.jsonb "opening_hours", default: {}, null: false
    t.boolean "is_main", default: false, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "qr_settings", default: {}, null: false
    t.time "business_day_start", default: "2000-01-01 06:01:00", null: false
    t.index ["business_id", "code"], name: "index_branches_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_branches_on_business_id"
  end

  create_table "businesses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "legal_name"
    t.string "country", limit: 2, default: "PK", null: false
    t.string "currency", limit: 3, default: "PKR", null: false
    t.string "time_zone", default: "Asia/Karachi", null: false
    t.string "phone"
    t.string "email"
    t.string "logo_key"
    t.uuid "plan_id"
    t.date "trial_ends_on"
    t.string "status", default: "trial", null: false
    t.datetime "deleted_at"
    t.jsonb "settings", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "read_only_at"
    t.datetime "trial_reminder_60_at"
    t.datetime "trial_reminder_80_at"
    t.datetime "trial_reminder_88_at"
    t.integer "whatsapp_credits", default: 0, null: false
    t.bigint "settings_version", default: 0, null: false
    t.index ["plan_id"], name: "index_businesses_on_plan_id"
    t.index ["slug"], name: "index_businesses_on_slug", unique: true
    t.check_constraint "status::text = ANY (ARRAY['trial'::character varying, 'active'::character varying, 'grace'::character varying, 'read_only'::character varying, 'deleted'::character varying]::text[])", name: "businesses_status_check"
  end

  create_table "campaigns", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.jsonb "segment", default: {}, null: false
    t.text "body", null: false
    t.uuid "promotion_id"
    t.string "status", default: "draft", null: false
    t.datetime "scheduled_at"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.integer "audience_count", default: 0, null: false
    t.integer "sent_count", default: 0, null: false
    t.integer "skipped_count", default: 0, null: false
    t.integer "redeemed_count", default: 0, null: false
    t.uuid "created_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_campaigns_on_business_id"
    t.index ["promotion_id"], name: "index_campaigns_on_promotion_id"
    t.check_constraint "status::text = ANY (ARRAY['draft'::character varying, 'scheduled'::character varying, 'sending'::character varying, 'sent'::character varying, 'cancelled'::character varying]::text[])", name: "campaigns_status_check"
  end

  create_table "cash_movements", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "shift_id", null: false
    t.string "kind", null: false
    t.bigint "amount_minor", null: false
    t.string "reason", null: false
    t.string "reference"
    t.uuid "by_membership_id"
    t.uuid "approved_by_membership_id"
    t.uuid "account_entry_id"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_cash_movements_on_business_id"
    t.index ["shift_id"], name: "index_cash_movements_on_shift_id"
    t.check_constraint "kind::text = ANY (ARRAY['cash_in'::character varying, 'cash_out'::character varying, 'payout'::character varying, 'float_issue'::character varying, 'float_return'::character varying, 'drop'::character varying]::text[])", name: "cash_movements_kind_check"
  end

  create_table "categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "menu_id", null: false
    t.string "name", null: false
    t.string "name_ur"
    t.string "image_key"
    t.integer "sort_order", default: 0, null: false
    t.boolean "show_online", default: true, null: false
    t.uuid "station_id"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "subtitle"
    t.index ["business_id"], name: "index_categories_on_business_id"
    t.index ["menu_id", "sort_order"], name: "index_categories_on_menu_id_and_sort_order"
    t.index ["menu_id"], name: "index_categories_on_menu_id"
  end

  create_table "checklist_runs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "kind", null: false
    t.date "business_day", null: false
    t.uuid "shift_id"
    t.jsonb "items", default: [], null: false
    t.integer "done_count", default: 0, null: false
    t.integer "total_count", default: 0, null: false
    t.datetime "completed_at"
    t.uuid "started_by_membership_id"
    t.uuid "completed_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "business_day", "kind"], name: "index_checklist_runs_on_branch_id_and_business_day_and_kind", unique: true
    t.index ["branch_id"], name: "index_checklist_runs_on_branch_id"
    t.index ["business_id"], name: "index_checklist_runs_on_business_id"
  end

  create_table "checklist_templates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "kind", null: false
    t.jsonb "items", default: [], null: false
    t.boolean "required_for_shift", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_checklist_templates_on_branch_id"
    t.index ["business_id", "branch_id", "kind"], name: "idx_on_business_id_branch_id_kind_1e0f7ae919", unique: true
    t.index ["business_id"], name: "index_checklist_templates_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['opening'::character varying, 'closing'::character varying]::text[])", name: "checklist_templates_kind_check"
  end

  create_table "commission_rules", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "applies_to", default: "order_taker", null: false
    t.string "role_key"
    t.uuid "membership_id"
    t.string "basis", default: "percent_of_sales", null: false
    t.decimal "value", precision: 12, scale: 4, null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_commission_rules_on_business_id"
    t.check_constraint "applies_to::text = ANY (ARRAY['order_taker'::character varying, 'waiter'::character varying, 'cashier'::character varying, 'rider'::character varying]::text[])", name: "commission_rules_applies_check"
    t.check_constraint "basis::text = ANY (ARRAY['percent_of_sales'::character varying, 'per_order'::character varying, 'per_item'::character varying]::text[])", name: "commission_rules_basis_check"
  end

  create_table "customer_addresses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "customer_id", null: false
    t.string "label"
    t.string "line1", null: false
    t.string "line2"
    t.string "area"
    t.string "city"
    t.decimal "lat", precision: 10, scale: 7
    t.decimal "lng", precision: 10, scale: 7
    t.boolean "is_default", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_customer_addresses_on_business_id"
    t.index ["customer_id"], name: "index_customer_addresses_on_customer_id"
  end

  create_table "customer_adjustments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "customer_id", null: false
    t.integer "number", null: false
    t.string "kind", null: false
    t.bigint "amount_minor", null: false
    t.text "reason", null: false
    t.date "effective_on", null: false
    t.date "business_day", null: false
    t.uuid "by_membership_id"
    t.uuid "approved_by_membership_id"
    t.uuid "reverses_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "number"], name: "index_customer_adjustments_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_customer_adjustments_on_business_id"
    t.index ["customer_id"], name: "index_customer_adjustments_on_customer_id"
    t.index ["reverses_id"], name: "index_customer_adjustments_on_reverses_id", unique: true, where: "(reverses_id IS NOT NULL)"
    t.check_constraint "amount_minor <> 0", name: "customer_adjustments_amount_check"
    t.check_constraint "kind::text = ANY (ARRAY['opening'::character varying, 'adjustment'::character varying, 'reversal'::character varying]::text[])", name: "customer_adjustments_kind_check"
  end

  create_table "customer_groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.decimal "discount_percent", precision: 5, scale: 2, default: "0.0", null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "name"], name: "index_customer_groups_on_business_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["business_id"], name: "index_customer_groups_on_business_id"
  end

  create_table "customer_payments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "customer_id", null: false
    t.integer "number", null: false
    t.string "direction", default: "received", null: false
    t.bigint "amount_minor", null: false
    t.uuid "payment_method_id"
    t.uuid "payment_account_id"
    t.string "reference"
    t.uuid "collected_by_membership_id"
    t.uuid "shift_id"
    t.date "business_day", null: false
    t.datetime "received_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "number"], name: "index_customer_payments_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_customer_payments_on_business_id"
    t.index ["customer_id"], name: "index_customer_payments_on_customer_id"
    t.index ["payment_account_id"], name: "index_customer_payments_on_payment_account_id"
    t.index ["payment_method_id"], name: "index_customer_payments_on_payment_method_id"
    t.check_constraint "direction::text = ANY (ARRAY['received'::character varying, 'paid'::character varying]::text[])", name: "customer_payments_direction_check"
  end

  create_table "customers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.integer "khata_no", null: false
    t.string "name", null: false
    t.string "phone"
    t.string "email"
    t.string "company"
    t.uuid "group_id"
    t.string "source", default: "in_store", null: false
    t.string "status", default: "active", null: false
    t.boolean "is_walk_in", default: false, null: false
    t.bigint "credit_limit_minor"
    t.bigint "balance_minor", default: 0, null: false
    t.integer "loyalty_points", default: 0, null: false
    t.date "birthday"
    t.boolean "whatsapp_opt_in", default: false, null: false
    t.datetime "opt_in_at"
    t.string "opt_in_source"
    t.datetime "opted_out_at"
    t.text "notes"
    t.integer "orders_count", default: 0, null: false
    t.bigint "net_spent_minor", default: 0, null: false
    t.datetime "last_order_at"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "room"
    t.string "member_no"
    t.string "guardian_name"
    t.string "guardian_phone"
    t.boolean "notify_guardian", default: false, null: false
    t.index ["business_id", "guardian_phone"], name: "index_customers_on_business_id_and_guardian_phone", where: "(guardian_phone IS NOT NULL)"
    t.index ["business_id", "khata_no"], name: "index_customers_on_business_id_and_khata_no", unique: true
    t.index ["business_id", "member_no"], name: "index_customers_on_business_id_and_member_no", where: "((member_no IS NOT NULL) AND (archived_at IS NULL))"
    t.index ["business_id", "phone"], name: "index_customers_on_business_id_and_phone", unique: true, where: "((phone IS NOT NULL) AND (archived_at IS NULL))"
    t.index ["business_id"], name: "idx_customers_one_walk_in", unique: true, where: "is_walk_in"
    t.index ["business_id"], name: "index_customers_on_business_id"
    t.index ["group_id"], name: "index_customers_on_group_id"
    t.check_constraint "source::text = ANY (ARRAY['in_store'::character varying, 'online'::character varying, 'qr'::character varying, 'phone'::character varying, 'import'::character varying]::text[])", name: "customers_source_check"
    t.check_constraint "status::text = ANY (ARRAY['active'::character varying, 'pending_approval'::character varying, 'deactivated'::character varying]::text[])", name: "customers_status_check"
  end

  create_table "day_closes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.date "business_day", null: false
    t.datetime "locked_at"
    t.uuid "locked_by_membership_id"
    t.datetime "reopened_at"
    t.uuid "reopened_by_membership_id"
    t.string "reopen_reason"
    t.jsonb "summary", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "business_day"], name: "index_day_closes_on_branch_id_and_business_day", unique: true
    t.index ["branch_id"], name: "index_day_closes_on_branch_id"
    t.index ["business_id"], name: "index_day_closes_on_business_id"
  end

  create_table "day_end_settlements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.date "business_day", null: false
    t.uuid "settled_by_membership_id"
    t.integer "shifts_count", default: 0, null: false
    t.bigint "amount_minor", default: 0, null: false
    t.jsonb "detail", default: {}, null: false
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "branch_id", "business_day"], name: "idx_on_business_id_branch_id_business_day_06ff3c9fce"
    t.index ["business_id"], name: "index_day_end_settlements_on_business_id"
  end

  create_table "deal_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "deal_id", null: false
    t.uuid "product_id", null: false
    t.uuid "variant_id"
    t.integer "quantity", default: 1, null: false
    t.string "choice_group"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_deal_items_on_business_id"
    t.index ["deal_id"], name: "index_deal_items_on_deal_id"
    t.index ["product_id"], name: "index_deal_items_on_product_id"
  end

  create_table "deals", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.text "description"
    t.string "image_key"
    t.bigint "price_minor", null: false
    t.boolean "active", default: true, null: false
    t.boolean "show_online", default: true, null: false
    t.datetime "valid_from"
    t.datetime "valid_to"
    t.uuid "tax_rate_id"
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "is_favourite", default: false, null: false
    t.index ["business_id"], name: "index_deals_on_business_id"
    t.index ["tax_rate_id"], name: "index_deals_on_tax_rate_id"
  end

  create_table "deduction_audits", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.string "status", null: false
    t.uuid "ledger_entry_ids", default: [], null: false, array: true
    t.jsonb "detail", default: {}, null: false
    t.datetime "checked_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "status"], name: "index_deduction_audits_on_business_id_and_status"
    t.index ["business_id"], name: "index_deduction_audits_on_business_id"
    t.index ["order_id"], name: "index_deduction_audits_on_order_id"
    t.check_constraint "status::text = ANY (ARRAY['ok'::character varying, 'missing'::character varying, 'partial'::character varying, 'reversed'::character varying, 'waste'::character varying, 'skipped'::character varying, 'error'::character varying]::text[])", name: "deduction_audits_status_check"
  end

  create_table "deliveries", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "order_id", null: false
    t.uuid "rider_id"
    t.uuid "zone_id"
    t.uuid "address_id"
    t.bigint "charge_minor", default: 0, null: false
    t.string "status", default: "unassigned", null: false
    t.string "failed_reason"
    t.bigint "cash_collected_minor"
    t.uuid "settlement_id"
    t.datetime "assigned_at"
    t.datetime "picked_up_at"
    t.datetime "delivered_at"
    t.datetime "settled_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_deliveries_on_branch_id"
    t.index ["business_id"], name: "index_deliveries_on_business_id"
    t.index ["order_id"], name: "index_deliveries_on_order_id", unique: true
    t.index ["rider_id", "status"], name: "index_deliveries_on_rider_id_and_status"
    t.index ["rider_id"], name: "index_deliveries_on_rider_id"
    t.index ["zone_id"], name: "index_deliveries_on_zone_id"
    t.check_constraint "status::text = ANY (ARRAY['unassigned'::character varying, 'assigned'::character varying, 'picked_up'::character varying, 'on_the_way'::character varying, 'arrived'::character varying, 'delivered'::character varying, 'failed'::character varying]::text[])", name: "deliveries_status_check"
  end

  create_table "delivery_status_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "delivery_id", null: false
    t.string "status", null: false
    t.decimal "lat", precision: 10, scale: 7
    t.decimal "lng", precision: 10, scale: 7
    t.string "note"
    t.uuid "by_membership_id"
    t.datetime "occurred_at", null: false
    t.datetime "synced_at"
    t.datetime "created_at", null: false
    t.index ["business_id"], name: "index_delivery_status_events_on_business_id"
    t.index ["delivery_id"], name: "index_delivery_status_events_on_delivery_id"
  end

  create_table "delivery_zones", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "name", null: false
    t.jsonb "polygon", default: [], null: false
    t.text "areas", default: [], null: false, array: true
    t.bigint "charge_minor", default: 0, null: false
    t.bigint "min_order_minor", default: 0, null: false
    t.integer "eta_minutes"
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "name"], name: "index_delivery_zones_on_branch_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["branch_id"], name: "index_delivery_zones_on_branch_id"
    t.index ["business_id"], name: "index_delivery_zones_on_business_id"
  end

  create_table "departments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "name"], name: "index_departments_on_business_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["business_id"], name: "index_departments_on_business_id"
  end

  create_table "devices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "name", null: false
    t.string "code", null: false
    t.string "kind", default: "till", null: false
    t.uuid "station_id"
    t.string "pairing_code"
    t.datetime "pairing_expires_at"
    t.datetime "paired_at"
    t.string "token_digest"
    t.string "platform"
    t.string "app_version"
    t.datetime "last_sync_at"
    t.datetime "last_seen_at"
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_devices_on_branch_id"
    t.index ["business_id", "branch_id", "code"], name: "index_devices_on_business_id_and_branch_id_and_code", unique: true
    t.index ["business_id"], name: "index_devices_on_business_id"
    t.index ["pairing_code"], name: "index_devices_on_pairing_code", unique: true, where: "(pairing_code IS NOT NULL)"
    t.check_constraint "kind::text = ANY (ARRAY['till'::character varying, 'tablet'::character varying, 'kitchen'::character varying, 'customer_display'::character varying, 'token_screen'::character varying, 'kiosk'::character varying, 'rider'::character varying]::text[])", name: "devices_kind_check"
  end

  create_table "dining_tables", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "floor_id"
    t.string "code", null: false
    t.string "name"
    t.integer "seats", default: 4, null: false
    t.string "location"
    t.string "status", default: "available", null: false
    t.jsonb "position", default: {}, null: false
    t.string "qr_token", null: false
    t.uuid "merged_into_table_id"
    t.uuid "current_order_id"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "waiter_membership_id"
    t.index ["branch_id", "code"], name: "index_dining_tables_on_branch_id_and_code", unique: true, where: "(archived_at IS NULL)"
    t.index ["branch_id"], name: "index_dining_tables_on_branch_id"
    t.index ["business_id"], name: "index_dining_tables_on_business_id"
    t.index ["floor_id"], name: "index_dining_tables_on_floor_id"
    t.index ["qr_token"], name: "index_dining_tables_on_qr_token", unique: true
    t.check_constraint "status::text = ANY (ARRAY['available'::character varying, 'occupied'::character varying, 'reserved'::character varying, 'bill_requested'::character varying, 'maintenance'::character varying]::text[])", name: "dining_tables_status_check"
  end

  create_table "discounts_applied", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.uuid "order_item_id"
    t.uuid "promotion_id"
    t.string "kind", null: false
    t.decimal "value", precision: 12, scale: 2, null: false
    t.bigint "amount_minor", default: 0, null: false
    t.string "reason"
    t.uuid "applied_by_membership_id"
    t.uuid "approved_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "regular_discount_tier_id"
    t.uuid "voucher_id"
    t.index ["business_id"], name: "index_discounts_applied_on_business_id"
    t.index ["order_id"], name: "index_discounts_applied_on_order_id"
  end

  create_table "document_counters", id: false, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "kind", null: false
    t.integer "last_number", default: 0, null: false
    t.index ["business_id", "kind"], name: "index_document_counters_on_business_id_and_kind", unique: true
  end

  create_table "employee_salary_components", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "employee_id", null: false
    t.uuid "salary_component_id", null: false
    t.bigint "amount_minor"
    t.decimal "percent", precision: 6, scale: 2
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_employee_salary_components_on_business_id"
    t.index ["employee_id", "salary_component_id"], name: "idx_employee_components_unique", unique: true
    t.index ["employee_id"], name: "index_employee_salary_components_on_employee_id"
    t.index ["salary_component_id"], name: "index_employee_salary_components_on_salary_component_id"
  end

  create_table "employees", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "membership_id"
    t.uuid "department_id"
    t.string "name", null: false
    t.string "phone"
    t.string "cnic"
    t.string "designation"
    t.bigint "base_salary_minor", default: 0, null: false
    t.string "pay_frequency", default: "monthly", null: false
    t.date "joined_on"
    t.date "left_on"
    t.boolean "fingerprint_enrolled", default: false, null: false
    t.boolean "shares_tips", default: false, null: false
    t.text "notes"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "fingerprint_id"
    t.datetime "fingerprint_enrolled_at"
    t.datetime "fingerprint_revoked_at"
    t.boolean "whatsapp_notify", default: true, null: false
    t.index ["branch_id"], name: "index_employees_on_branch_id"
    t.index ["business_id", "fingerprint_id"], name: "index_employees_on_business_id_and_fingerprint_id", unique: true, where: "(fingerprint_id IS NOT NULL)"
    t.index ["business_id", "membership_id"], name: "index_employees_on_business_id_and_membership_id", unique: true, where: "(membership_id IS NOT NULL)"
    t.index ["business_id"], name: "index_employees_on_business_id"
    t.index ["department_id"], name: "index_employees_on_department_id"
    t.index ["membership_id"], name: "index_employees_on_membership_id"
    t.check_constraint "pay_frequency::text = ANY (ARRAY['monthly'::character varying, 'weekly'::character varying, 'daily'::character varying]::text[])", name: "employees_pay_frequency_check"
  end

  create_table "expense_categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.uuid "parent_id"
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "parent_id", "name"], name: "index_expense_categories_on_business_id_and_parent_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["business_id"], name: "index_expense_categories_on_business_id"
    t.index ["parent_id"], name: "index_expense_categories_on_parent_id"
  end

  create_table "expenses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "category_id", null: false
    t.integer "number", null: false
    t.bigint "amount_minor", null: false
    t.uuid "payment_method_id"
    t.uuid "payment_account_id"
    t.uuid "shift_id"
    t.uuid "client_id"
    t.string "receipt_key"
    t.string "paid_to"
    t.text "note"
    t.date "spent_on", null: false
    t.date "business_day", null: false
    t.string "source", default: "admin", null: false
    t.uuid "by_membership_id"
    t.uuid "approved_by_membership_id"
    t.datetime "voided_at"
    t.string "void_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "business_day"], name: "index_expenses_on_branch_id_and_business_day"
    t.index ["branch_id"], name: "index_expenses_on_branch_id"
    t.index ["business_id", "client_id"], name: "index_expenses_on_business_id_and_client_id", unique: true, where: "(client_id IS NOT NULL)"
    t.index ["business_id", "number"], name: "index_expenses_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_expenses_on_business_id"
    t.index ["category_id"], name: "index_expenses_on_category_id"
    t.check_constraint "source::text = ANY (ARRAY['admin'::character varying, 'till'::character varying, 'payroll_sync'::character varying, 'rider_float'::character varying]::text[])", name: "expenses_source_check"
  end

  create_table "feature_flags", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.uuid "business_id"
    t.boolean "enabled", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key", "business_id"], name: "index_feature_flags_on_key_and_business_id", unique: true
  end

  create_table "fixed_assets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "name", null: false
    t.uuid "gl_account_id", null: false
    t.uuid "accumulated_account_id", null: false
    t.uuid "expense_account_id", null: false
    t.bigint "cost_minor", null: false
    t.bigint "salvage_minor", default: 0, null: false
    t.date "purchased_on", null: false
    t.integer "useful_life_months", null: false
    t.string "method", default: "straight_line", null: false
    t.bigint "accumulated_minor", default: 0, null: false
    t.date "depreciated_through"
    t.datetime "disposed_at"
    t.string "status", default: "active", null: false
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_fixed_assets_on_business_id"
    t.index ["gl_account_id"], name: "index_fixed_assets_on_gl_account_id"
  end

  create_table "floors", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "name", null: false
    t.integer "sort_order", default: 0, null: false
    t.jsonb "layout", default: {}, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_floors_on_branch_id"
    t.index ["business_id"], name: "index_floors_on_business_id"
  end

  create_table "gl_accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "code", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.string "normal_side", null: false
    t.uuid "parent_id"
    t.bigint "opening_balance_minor", default: 0, null: false
    t.boolean "is_system", default: false, null: false
    t.boolean "is_header", default: false, null: false
    t.uuid "payment_account_id"
    t.text "description"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "code"], name: "index_gl_accounts_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_gl_accounts_on_business_id"
    t.index ["payment_account_id"], name: "index_gl_accounts_on_payment_account_id"
    t.check_constraint "kind::text = ANY (ARRAY['asset'::character varying, 'liability'::character varying, 'equity'::character varying, 'income'::character varying, 'expense'::character varying]::text[])", name: "gl_accounts_kind_check"
    t.check_constraint "normal_side::text = ANY (ARRAY['debit'::character varying, 'credit'::character varying]::text[])", name: "gl_accounts_side_check"
  end

  create_table "goods_receipt_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "goods_receipt_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "unit_id", null: false
    t.uuid "purchase_order_line_id"
    t.decimal "quantity", precision: 20, scale: 9, null: false
    t.decimal "base_quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.bigint "unit_cost_minor", default: 0, null: false
    t.string "batch_no"
    t.date "expires_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_goods_receipt_lines_on_business_id"
    t.index ["goods_receipt_id"], name: "index_goods_receipt_lines_on_goods_receipt_id"
    t.index ["purchase_order_line_id"], name: "index_goods_receipt_lines_on_purchase_order_line_id"
    t.index ["stock_item_id"], name: "index_goods_receipt_lines_on_stock_item_id"
    t.index ["unit_id"], name: "index_goods_receipt_lines_on_unit_id"
  end

  create_table "goods_receipts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "supplier_id", null: false
    t.uuid "purchase_order_id"
    t.uuid "stock_document_id"
    t.uuid "stock_section_id"
    t.integer "number", null: false
    t.string "status", default: "posted", null: false
    t.string "invoice_ref"
    t.string "invoice_key"
    t.date "received_on", null: false
    t.date "business_day"
    t.bigint "total_minor", default: 0, null: false
    t.text "note"
    t.uuid "by_membership_id"
    t.datetime "cancelled_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_goods_receipts_on_branch_id"
    t.index ["business_id", "number"], name: "index_goods_receipts_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_goods_receipts_on_business_id"
    t.index ["purchase_order_id"], name: "index_goods_receipts_on_purchase_order_id"
    t.index ["stock_document_id"], name: "index_goods_receipts_on_stock_document_id"
    t.index ["stock_section_id"], name: "index_goods_receipts_on_stock_section_id"
    t.index ["supplier_id"], name: "index_goods_receipts_on_supplier_id"
  end

  create_table "holidays", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "name", null: false
    t.date "on_date", null: false
    t.boolean "paid", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_holidays_on_branch_id"
    t.index ["business_id", "on_date", "branch_id"], name: "index_holidays_on_business_id_and_on_date_and_branch_id", unique: true
    t.index ["business_id"], name: "index_holidays_on_business_id"
  end

  create_table "import_jobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "kind", null: false
    t.string "source", null: false
    t.string "status", default: "previewed", null: false
    t.integer "row_count", default: 0, null: false
    t.jsonb "preview", default: {}, null: false
    t.jsonb "error_rows", default: [], null: false
    t.uuid "by_user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_import_jobs_on_business_id"
  end

  create_table "inventory_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.date "day_lock_date"
    t.boolean "counting_open", default: false, null: false
    t.boolean "allow_manual_below_zero", default: false, null: false
    t.boolean "return_on_cancel", default: true, null: false
    t.string "weight_display", default: "auto", null: false
    t.string "volume_display", default: "auto", null: false
    t.decimal "food_cost_target_percent", precision: 5, scale: 2, default: "35.0", null: false
    t.boolean "require_recipe_to_live", default: false, null: false
    t.boolean "deduct_stock_on_sale", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_inventory_settings_on_business_id", unique: true
  end

  create_table "invoices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "subscription_id"
    t.string "number", null: false
    t.bigint "amount_minor", null: false
    t.string "currency", limit: 3, default: "PKR", null: false
    t.date "due_on", null: false
    t.string "status", default: "open", null: false
    t.string "pdf_key"
    t.string "kind", default: "subscription", null: false
    t.string "period_label"
    t.string "payment_method"
    t.string "payment_reference"
    t.datetime "reported_at"
    t.datetime "confirmed_at"
    t.uuid "confirmed_by_super_admin_id"
    t.jsonb "lines", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "status"], name: "index_invoices_on_business_id_and_status"
    t.index ["business_id"], name: "index_invoices_on_business_id"
    t.index ["number"], name: "index_invoices_on_number", unique: true
    t.index ["subscription_id"], name: "index_invoices_on_subscription_id"
    t.check_constraint "status::text = ANY (ARRAY['open'::character varying, 'reported'::character varying, 'paid'::character varying, 'void'::character varying]::text[])", name: "invoices_status_check"
  end

  create_table "journal_entries", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.integer "number", null: false
    t.string "kind", default: "manual", null: false
    t.date "business_day", null: false
    t.string "description"
    t.string "ref_table"
    t.uuid "ref_id"
    t.uuid "reversed_by_id"
    t.uuid "reverses_id"
    t.uuid "by_membership_id"
    t.datetime "posted_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "business_day"], name: "index_journal_entries_on_business_id_and_business_day"
    t.index ["business_id", "number"], name: "index_journal_entries_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_journal_entries_on_business_id"
    t.index ["ref_table", "ref_id"], name: "index_journal_entries_on_ref_table_and_ref_id"
  end

  create_table "journal_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "journal_entry_id", null: false
    t.uuid "gl_account_id", null: false
    t.bigint "debit_minor", default: 0, null: false
    t.bigint "credit_minor", default: 0, null: false
    t.string "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_journal_lines_on_business_id"
    t.index ["gl_account_id"], name: "index_journal_lines_on_gl_account_id"
    t.index ["journal_entry_id"], name: "index_journal_lines_on_journal_entry_id"
    t.check_constraint "debit_minor >= 0 AND credit_minor >= 0 AND (debit_minor = 0 OR credit_minor = 0)", name: "journal_lines_one_side"
  end

  create_table "kitchen_tickets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "order_id", null: false
    t.uuid "station_id"
    t.string "kind", default: "new", null: false
    t.jsonb "lines", default: [], null: false
    t.integer "serial"
    t.string "order_type"
    t.string "table_code"
    t.datetime "printed_at"
    t.datetime "acknowledged_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_kitchen_tickets_on_branch_id"
    t.index ["business_id", "branch_id", "station_id", "created_at"], name: "idx_on_business_id_branch_id_station_id_created_at_23888726c9"
    t.index ["business_id"], name: "index_kitchen_tickets_on_business_id"
    t.index ["order_id"], name: "index_kitchen_tickets_on_order_id"
    t.check_constraint "kind::text = ANY (ARRAY['new'::character varying, 'changed'::character varying, 'cancelled'::character varying, 'reprint'::character varying]::text[])", name: "kitchen_tickets_kind_check"
  end

  create_table "leave_requests", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "employee_id", null: false
    t.string "kind", null: false
    t.date "from_date", null: false
    t.date "to_date", null: false
    t.text "reason"
    t.string "status", default: "pending", null: false
    t.uuid "approved_by_membership_id"
    t.datetime "decided_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_leave_requests_on_business_id"
    t.index ["employee_id"], name: "index_leave_requests_on_employee_id"
    t.check_constraint "kind::text = ANY (ARRAY['paid'::character varying, 'unpaid'::character varying, 'sick'::character varying]::text[])", name: "leave_requests_kind_check"
    t.check_constraint "status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])", name: "leave_requests_status_check"
  end

  create_table "loyalty_redemption_options", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.integer "points", null: false
    t.string "kind", default: "fixed", null: false
    t.decimal "value", precision: 12, scale: 2, null: false
    t.boolean "active", default: true, null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "product_id"
    t.index ["business_id"], name: "index_loyalty_redemption_options_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['fixed'::character varying, 'percent'::character varying, 'free_item'::character varying]::text[])", name: "loyalty_redemption_options_kind_check"
  end

  create_table "loyalty_transactions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "customer_id", null: false
    t.uuid "order_id"
    t.integer "points", null: false
    t.integer "balance_after", default: 0, null: false
    t.string "kind", null: false
    t.string "note"
    t.uuid "by_membership_id"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.index ["business_id"], name: "index_loyalty_transactions_on_business_id"
    t.index ["customer_id", "occurred_at"], name: "index_loyalty_transactions_on_customer_id_and_occurred_at"
    t.index ["customer_id"], name: "index_loyalty_transactions_on_customer_id"
    t.index ["order_id"], name: "index_loyalty_transactions_on_order_id"
    t.check_constraint "kind::text = ANY (ARRAY['earn'::character varying, 'redeem'::character varying, 'adjust'::character varying, 'expire'::character varying, 'refund'::character varying]::text[])", name: "loyalty_transactions_kind_check"
  end

  create_table "memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "user_id", null: false
    t.uuid "role_id", null: false
    t.string "pin_digest"
    t.integer "pin_failed_count", default: 0, null: false
    t.datetime "pin_locked_until"
    t.string "status", default: "active", null: false
    t.string "invited_via"
    t.boolean "all_branches", default: true, null: false
    t.uuid "branch_ids", default: [], null: false, array: true
    t.datetime "deactivated_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "permissions_mode", default: "role", null: false
    t.string "staff_type", null: false
    t.string "cashier_role"
    t.index ["business_id", "staff_type"], name: "index_memberships_on_business_id_and_staff_type"
    t.index ["business_id", "user_id"], name: "index_memberships_on_business_id_and_user_id", unique: true
    t.index ["business_id"], name: "index_memberships_on_business_id"
    t.index ["role_id"], name: "index_memberships_on_role_id"
    t.index ["user_id"], name: "index_memberships_on_user_id"
    t.check_constraint "cashier_role IS NULL OR (cashier_role::text = ANY (ARRAY['cashier'::character varying, 'supervisor'::character varying, 'kitchen_display'::character varying]::text[]))", name: "memberships_cashier_role_check"
    t.check_constraint "permissions_mode::text = ANY (ARRAY['role'::character varying, 'custom'::character varying]::text[])", name: "memberships_permissions_mode_check"
    t.check_constraint "staff_type::text = ANY (ARRAY['admin'::character varying, 'cashier'::character varying, 'order_taker'::character varying, 'rider'::character varying]::text[])", name: "memberships_staff_type_check"
    t.check_constraint "status::text = ANY (ARRAY['invited'::character varying, 'active'::character varying, 'deactivated'::character varying]::text[])", name: "memberships_status_check"
  end

  create_table "menus", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.boolean "show_online", default: true, null: false
    t.jsonb "time_rules", default: {}, null: false
    t.integer "sort_order", default: 0, null: false
    t.boolean "is_default", default: false, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_menus_on_business_id"
  end

  create_table "modifier_groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.integer "min_select", default: 0, null: false
    t.integer "max_select", default: 1, null: false
    t.boolean "required", default: false, null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_modifier_groups_on_business_id"
  end

  create_table "modifiers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "modifier_group_id", null: false
    t.string "name", null: false
    t.string "name_ur"
    t.bigint "price_minor", default: 0, null: false
    t.uuid "stock_item_id"
    t.decimal "quantity", precision: 14, scale: 3
    t.integer "sort_order", default: 0, null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "stock_unit_id"
    t.index ["business_id"], name: "index_modifiers_on_business_id"
    t.index ["modifier_group_id"], name: "index_modifiers_on_modifier_group_id"
  end

  create_table "notifications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "user_id"
    t.string "kind", null: false
    t.string "title", null: false
    t.text "body"
    t.string "link"
    t.datetime "read_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "user_id", "read_at"], name: "index_notifications_on_business_id_and_user_id_and_read_at"
    t.index ["business_id"], name: "index_notifications_on_business_id"
  end

  create_table "order_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.string "event_type", null: false
    t.uuid "membership_id"
    t.string "user_name"
    t.string "role_name"
    t.uuid "device_id"
    t.jsonb "diff"
    t.bigint "amount_before"
    t.bigint "amount_after"
    t.string "note"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_order_events_on_business_id"
    t.index ["order_id", "occurred_at"], name: "index_order_events_on_order_id_and_occurred_at"
    t.index ["order_id"], name: "index_order_events_on_order_id"
  end

  create_table "order_item_modifiers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_item_id", null: false
    t.uuid "modifier_id"
    t.string "name_snapshot", null: false
    t.bigint "price_minor_snapshot", default: 0, null: false
    t.decimal "quantity", precision: 14, scale: 3, default: "1.0", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_order_item_modifiers_on_business_id"
    t.index ["order_item_id"], name: "index_order_item_modifiers_on_order_item_id"
  end

  create_table "order_items", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.uuid "product_id"
    t.uuid "variant_id"
    t.uuid "deal_id"
    t.string "name_snapshot", null: false
    t.bigint "unit_price_minor", null: false
    t.decimal "tax_rate_snapshot", precision: 6, scale: 3, default: "0.0", null: false
    t.boolean "tax_inclusive_snapshot", default: false, null: false
    t.bigint "recipe_cost_minor_snapshot", default: 0, null: false
    t.decimal "quantity", precision: 14, scale: 3, default: "1.0", null: false
    t.string "unit"
    t.bigint "modifiers_minor", default: 0, null: false
    t.bigint "line_subtotal_minor", default: 0, null: false
    t.bigint "line_discount_minor", default: 0, null: false
    t.bigint "line_tax_minor", default: 0, null: false
    t.bigint "line_total_minor", default: 0, null: false
    t.text "notes"
    t.uuid "station_id"
    t.integer "course", default: 1, null: false
    t.string "status", default: "pending", null: false
    t.datetime "sent_at"
    t.datetime "bumped_at"
    t.string "cancelled_reason"
    t.boolean "open_item", default: false, null: false
    t.boolean "price_overridden", default: false, null: false
    t.uuid "override_approved_by_id"
    t.jsonb "deal_components", default: [], null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "station_id", "status"], name: "index_order_items_on_business_id_and_station_id_and_status"
    t.index ["business_id"], name: "index_order_items_on_business_id"
    t.index ["order_id", "sort_order"], name: "index_order_items_on_order_id_and_sort_order"
    t.index ["order_id"], name: "index_order_items_on_order_id"
    t.check_constraint "status::text = ANY (ARRAY['pending'::character varying, 'sent'::character varying, 'preparing'::character varying, 'ready'::character varying, 'served'::character varying, 'cancelled'::character varying]::text[])", name: "order_items_status_check"
  end

  create_table "order_serials", id: false, force: :cascade do |t|
    t.uuid "branch_id", null: false
    t.date "business_day", null: false
    t.integer "last_serial", default: 0, null: false
    t.index ["branch_id", "business_day"], name: "index_order_serials_on_branch_id_and_business_day", unique: true
  end

  create_table "order_status_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.string "from_status"
    t.string "to_status", null: false
    t.uuid "membership_id"
    t.uuid "device_id"
    t.string "reason"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_order_status_events_on_business_id"
    t.index ["order_id", "occurred_at"], name: "index_order_status_events_on_order_id_and_occurred_at"
    t.index ["order_id"], name: "index_order_status_events_on_order_id"
  end

  create_table "order_type_consumables", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.uuid "variant_id"
    t.string "order_type", null: false
    t.uuid "stock_item_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, default: "1.0", null: false
    t.uuid "unit_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_order_type_consumables_on_business_id"
    t.index ["product_id", "variant_id", "order_type", "stock_item_id"], name: "index_consumables_unique", unique: true, nulls_not_distinct: true
    t.index ["product_id"], name: "index_order_type_consumables_on_product_id"
    t.index ["stock_item_id"], name: "index_order_type_consumables_on_stock_item_id"
  end

  create_table "orders", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "device_id"
    t.integer "serial"
    t.string "till_serial"
    t.date "business_day"
    t.string "order_type", default: "walk_in", null: false
    t.string "source", default: "till", null: false
    t.string "status", default: "draft", null: false
    t.uuid "table_id"
    t.string "guest_name"
    t.integer "covers"
    t.uuid "customer_id"
    t.uuid "address_id"
    t.uuid "rider_id"
    t.uuid "shift_id"
    t.uuid "taken_by_membership_id"
    t.uuid "completed_by_membership_id"
    t.boolean "is_staff_meal", default: false, null: false
    t.string "staff_meal_reason"
    t.uuid "staff_meal_approved_by_id"
    t.bigint "subtotal_minor", default: 0, null: false
    t.bigint "discount_minor", default: 0, null: false
    t.bigint "service_charge_minor", default: 0, null: false
    t.bigint "tax_minor", default: 0, null: false
    t.bigint "rounding_minor", default: 0, null: false
    t.bigint "cash_rounding_minor", default: 0, null: false
    t.bigint "tip_minor", default: 0, null: false
    t.bigint "delivery_charge_minor", default: 0, null: false
    t.bigint "total_minor", default: 0, null: false
    t.bigint "paid_minor", default: 0, null: false
    t.string "payment_status", default: "unpaid", null: false
    t.decimal "service_charge_percent", precision: 5, scale: 2, default: "0.0", null: false
    t.datetime "placed_at"
    t.datetime "ready_at"
    t.datetime "served_at"
    t.datetime "paid_at"
    t.datetime "closed_at"
    t.datetime "voided_at"
    t.string "void_reason"
    t.uuid "void_approved_by_id"
    t.string "aggregator_ref"
    t.bigint "aggregator_commission_minor", default: 0, null: false
    t.text "notes"
    t.datetime "client_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "waiter_membership_id"
    t.string "receipt_number"
    t.string "payment_method_summary"
    t.datetime "stock_deducted_at"
    t.string "qr_status"
    t.string "qr_guest_token"
    t.datetime "scheduled_for"
    t.datetime "preorder_notified_at"
    t.datetime "reopened_at"
    t.integer "reopen_count", default: 0, null: false
    t.integer "edit_count", default: 0, null: false
    t.boolean "unpaid_direct", default: false, null: false
    t.bigint "service_charge_fixed_minor", default: 0, null: false
    t.decimal "delivery_charge_percent", precision: 5, scale: 2, default: "0.0", null: false
    t.string "tax_choice"
    t.uuid "tax_rate_id"
    t.index ["branch_id", "business_day", "serial"], name: "index_orders_on_branch_id_and_business_day_and_serial", unique: true, where: "(serial IS NOT NULL)"
    t.index ["branch_id", "qr_status"], name: "index_orders_on_branch_id_and_qr_status", where: "(qr_status IS NOT NULL)"
    t.index ["branch_id", "scheduled_for"], name: "index_orders_on_branch_id_and_scheduled_for", where: "(scheduled_for IS NOT NULL)"
    t.index ["branch_id"], name: "index_orders_on_branch_id"
    t.index ["business_id", "branch_id", "business_day"], name: "index_orders_on_business_id_and_branch_id_and_business_day"
    t.index ["business_id", "customer_id"], name: "index_orders_on_business_id_and_customer_id"
    t.index ["business_id", "status"], name: "index_orders_on_business_id_and_status"
    t.index ["business_id"], name: "index_orders_on_business_id"
    t.check_constraint "order_type::text = ANY (ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'delivery'::character varying, 'walk_in'::character varying]::text[])", name: "orders_order_type_check"
    t.check_constraint "payment_status::text = ANY (ARRAY['unpaid'::character varying, 'partial'::character varying, 'paid'::character varying, 'refunded'::character varying]::text[])", name: "orders_payment_status_check"
    t.check_constraint "qr_status IS NULL OR (qr_status::text = ANY (ARRAY['pending'::character varying, 'accepted'::character varying, 'rejected'::character varying]::text[]))", name: "orders_qr_status_check"
    t.check_constraint "source::text = ANY (ARRAY['till'::character varying, 'qr'::character varying, 'online'::character varying, 'app'::character varying, 'phone'::character varying, 'foodpanda'::character varying, 'kiosk'::character varying]::text[])", name: "orders_source_check"
    t.check_constraint "status::text = ANY (ARRAY['draft'::character varying, 'held'::character varying, 'placed'::character varying, 'preparing'::character varying, 'ready'::character varying, 'served'::character varying, 'dispatched'::character varying, 'paid'::character varying, 'closed'::character varying, 'voided'::character varying, 'refunded'::character varying]::text[])", name: "orders_status_check"
  end

  create_table "otp_codes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "phone", null: false
    t.string "code_digest", null: false
    t.string "purpose", default: "login", null: false
    t.datetime "expires_at", null: false
    t.integer "attempts", default: 0, null: false
    t.datetime "consumed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["phone", "purpose"], name: "index_otp_codes_on_phone_and_purpose"
  end

  create_table "overheads", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "name", null: false
    t.string "kind", default: "other", null: false
    t.bigint "amount_minor", null: false
    t.string "basis", default: "per_month", null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_overheads_on_branch_id"
    t.index ["business_id"], name: "index_overheads_on_business_id"
    t.check_constraint "basis::text = ANY (ARRAY['per_order'::character varying, 'per_month'::character varying, 'per_day'::character varying]::text[])", name: "overheads_basis_check"
    t.check_constraint "kind::text = ANY (ARRAY['labor'::character varying, 'gas'::character varying, 'rent'::character varying, 'utilities'::character varying, 'other'::character varying]::text[])", name: "overheads_kind_check"
  end

  create_table "packaging_rules", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "order_type", null: false
    t.uuid "stock_item_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, default: "1.0", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_packaging_rules_on_branch_id"
    t.index ["business_id", "branch_id", "order_type", "stock_item_id"], name: "idx_packaging_rules_unique", unique: true
    t.index ["business_id"], name: "index_packaging_rules_on_business_id"
    t.index ["stock_item_id"], name: "index_packaging_rules_on_stock_item_id"
  end

  create_table "payment_accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "name", null: false
    t.string "kind", null: false
    t.boolean "is_default", default: false, null: false
    t.uuid "cashier_membership_id"
    t.uuid "shift_id"
    t.bigint "opening_balance_minor", default: 0, null: false
    t.bigint "current_balance_minor", default: 0, null: false
    t.boolean "active", default: true, null: false
    t.string "bank_name"
    t.string "account_no"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "kind"], name: "index_payment_accounts_on_business_id_and_kind"
    t.index ["business_id"], name: "index_payment_accounts_on_business_id"
    t.check_constraint "active OR current_balance_minor = 0", name: "payment_accounts_inactive_zero_balance"
    t.check_constraint "kind::text = ANY (ARRAY['cash'::character varying, 'wallet'::character varying, 'bank'::character varying, 'drawer'::character varying, 'custom'::character varying]::text[])", name: "payment_accounts_kind_check"
  end

  create_table "payment_methods", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "code", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.uuid "payment_account_id"
    t.boolean "active", default: true, null: false
    t.boolean "works_offline", default: false, null: false
    t.boolean "needs_reference", default: false, null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "catalogue_code"
    t.index ["business_id", "code"], name: "index_payment_methods_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_payment_methods_on_business_id"
    t.index ["payment_account_id"], name: "index_payment_methods_on_payment_account_id"
    t.check_constraint "kind::text = ANY (ARRAY['cash'::character varying, 'card'::character varying, 'wallet'::character varying, 'bank'::character varying, 'khata'::character varying, 'qr'::character varying, 'custom'::character varying]::text[])", name: "payment_methods_kind_check"
  end

  create_table "payments", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "order_id", null: false
    t.uuid "shift_id"
    t.uuid "payment_method_id", null: false
    t.uuid "payment_account_id"
    t.string "method_code", null: false
    t.bigint "amount_minor", null: false
    t.bigint "tendered_minor"
    t.bigint "change_minor", default: 0, null: false
    t.bigint "tip_minor", default: 0, null: false
    t.string "reference"
    t.string "card_terminal_ref"
    t.string "status", default: "captured", null: false
    t.uuid "received_by_membership_id"
    t.uuid "device_id"
    t.uuid "customer_id"
    t.date "business_day", null: false
    t.datetime "received_at", null: false
    t.datetime "client_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "business_day"], name: "index_payments_on_business_id_and_business_day"
    t.index ["business_id"], name: "index_payments_on_business_id"
    t.index ["order_id"], name: "index_payments_on_order_id"
    t.index ["payment_account_id"], name: "index_payments_on_payment_account_id"
    t.index ["payment_method_id"], name: "index_payments_on_payment_method_id"
    t.check_constraint "status::text = ANY (ARRAY['captured'::character varying, 'voided'::character varying, 'refunded'::character varying]::text[])", name: "payments_status_check"
  end

  create_table "payments_received", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "invoice_id"
    t.bigint "amount_minor", null: false
    t.string "method", null: false
    t.string "reference"
    t.date "received_on", null: false
    t.uuid "confirmed_by_user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_payments_received_on_business_id"
    t.index ["invoice_id"], name: "index_payments_received_on_invoice_id"
  end

  create_table "payroll_runs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.date "month", null: false
    t.string "status", default: "generated", null: false
    t.text "notes"
    t.integer "employees_count", default: 0, null: false
    t.bigint "gross_minor", default: 0, null: false
    t.bigint "deductions_minor", default: 0, null: false
    t.bigint "net_minor", default: 0, null: false
    t.uuid "generated_by_membership_id"
    t.uuid "paid_by_membership_id"
    t.uuid "payment_account_id"
    t.datetime "paid_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "settings_snapshot", default: {}, null: false
    t.index ["branch_id"], name: "index_payroll_runs_on_branch_id"
    t.index ["business_id", "branch_id", "month"], name: "index_payroll_runs_on_business_id_and_branch_id_and_month", unique: true
    t.index ["business_id"], name: "index_payroll_runs_on_business_id"
    t.check_constraint "status::text = ANY (ARRAY['generated'::character varying, 'approved'::character varying, 'paid'::character varying, 'cancelled'::character varying]::text[])", name: "payroll_runs_status_check"
  end

  create_table "payslips", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "payroll_run_id", null: false
    t.uuid "employee_id", null: false
    t.bigint "base_minor", default: 0, null: false
    t.bigint "earnings_minor", default: 0, null: false
    t.bigint "deductions_minor", default: 0, null: false
    t.bigint "absence_minor", default: 0, null: false
    t.bigint "late_fines_minor", default: 0, null: false
    t.bigint "advances_recovered_minor", default: 0, null: false
    t.bigint "tips_minor", default: 0, null: false
    t.bigint "commission_minor", default: 0, null: false
    t.bigint "net_minor", default: 0, null: false
    t.integer "days_present", default: 0, null: false
    t.integer "days_absent", default: 0, null: false
    t.integer "days_leave", default: 0, null: false
    t.jsonb "detail", default: {}, null: false
    t.datetime "paid_at"
    t.uuid "payment_account_id"
    t.uuid "expense_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_payslips_on_business_id"
    t.index ["employee_id"], name: "index_payslips_on_employee_id"
    t.index ["payroll_run_id", "employee_id"], name: "index_payslips_on_payroll_run_id_and_employee_id", unique: true
    t.index ["payroll_run_id"], name: "index_payslips_on_payroll_run_id"
  end

  create_table "plans", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "code", null: false
    t.string "name", null: false
    t.bigint "price_pkr_minor", default: 0, null: false
    t.bigint "price_usd_minor", default: 0, null: false
    t.jsonb "limits", default: {}, null: false
    t.jsonb "features", default: {}, null: false
    t.boolean "active", default: true, null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_plans_on_code", unique: true
  end

  create_table "platform_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.jsonb "value"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_platform_settings_on_key", unique: true
  end

  create_table "product_barcodes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.uuid "variant_id"
    t.string "code", null: false
    t.decimal "quantity", precision: 12, scale: 3, default: "1.0", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "code"], name: "index_product_barcodes_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_product_barcodes_on_business_id"
    t.index ["product_id"], name: "index_product_barcodes_on_product_id"
    t.check_constraint "quantity > 0::numeric", name: "product_barcodes_quantity_check"
  end

  create_table "product_modifier_groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.uuid "modifier_group_id", null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_product_modifier_groups_on_business_id"
    t.index ["modifier_group_id"], name: "index_product_modifier_groups_on_modifier_group_id"
    t.index ["product_id", "modifier_group_id"], name: "idx_on_product_id_modifier_group_id_50e5094f25", unique: true
    t.index ["product_id"], name: "index_product_modifier_groups_on_product_id"
  end

  create_table "product_prices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.uuid "variant_id"
    t.uuid "branch_id"
    t.string "order_type", null: false
    t.bigint "price_minor", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_product_prices_on_business_id"
    t.index ["product_id", "variant_id", "branch_id", "order_type"], name: "idx_product_prices_unique", unique: true
    t.index ["product_id"], name: "index_product_prices_on_product_id"
    t.check_constraint "order_type::text = ANY (ARRAY['dine_in'::character varying, 'takeaway'::character varying, 'delivery'::character varying, 'walk_in'::character varying, 'online'::character varying]::text[])", name: "product_prices_order_type_check"
  end

  create_table "product_variants", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.string "name", null: false
    t.bigint "price_minor", default: 0, null: false
    t.string "sku"
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_product_variants_on_business_id"
    t.index ["product_id"], name: "index_product_variants_on_product_id"
  end

  create_table "production_batches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "recipe_id", null: false
    t.uuid "stock_document_id"
    t.uuid "stock_section_id"
    t.decimal "quantity_produced", precision: 14, scale: 3, null: false
    t.bigint "cost_minor", default: 0, null: false
    t.datetime "produced_at", null: false
    t.uuid "by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_production_batches_on_branch_id"
    t.index ["business_id"], name: "index_production_batches_on_business_id"
    t.index ["recipe_id"], name: "index_production_batches_on_recipe_id"
    t.index ["stock_document_id"], name: "index_production_batches_on_stock_document_id"
    t.index ["stock_section_id"], name: "index_production_batches_on_stock_section_id"
  end

  create_table "products", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "category_id", null: false
    t.string "name", null: false
    t.string "name_ur"
    t.text "description"
    t.string "sku"
    t.string "image_key"
    t.bigint "base_price_minor", default: 0, null: false
    t.uuid "tax_rate_id"
    t.boolean "is_favourite", default: false, null: false
    t.boolean "show_online", default: true, null: false
    t.boolean "active", default: true, null: false
    t.boolean "sold_by_weight", default: false, null: false
    t.string "weight_unit"
    t.string "allergens", default: [], null: false, array: true
    t.string "dietary_tags", default: [], null: false, array: true
    t.uuid "station_id"
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "discount_value", precision: 12, scale: 2, default: "0.0", null: false
    t.string "discount_type", default: "percent", null: false
    t.string "pct_code"
    t.index ["business_id", "sku"], name: "index_products_on_business_id_and_sku", unique: true, where: "((sku IS NOT NULL) AND (archived_at IS NULL))"
    t.index ["business_id"], name: "index_products_on_business_id"
    t.index ["category_id", "sort_order"], name: "index_products_on_category_id_and_sort_order"
    t.index ["category_id"], name: "index_products_on_category_id"
    t.index ["tax_rate_id"], name: "index_products_on_tax_rate_id"
    t.check_constraint "discount_type::text = ANY (ARRAY['percent'::character varying, 'amount'::character varying]::text[])", name: "products_discount_type_check"
  end

  create_table "promotions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.decimal "value", precision: 12, scale: 2, null: false
    t.string "coupon_code"
    t.string "applies_to", default: "order", null: false
    t.uuid "target_ids", default: [], null: false, array: true
    t.integer "days", default: [], null: false, array: true
    t.time "start_time"
    t.time "end_time"
    t.datetime "valid_from"
    t.datetime "valid_to"
    t.integer "unit_limit"
    t.integer "units_sold", default: 0, null: false
    t.boolean "active", default: true, null: false
    t.bigint "min_order_minor", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "coupon_code"], name: "index_promotions_on_business_id_and_coupon_code", unique: true, where: "((coupon_code IS NOT NULL) AND (archived_at IS NULL))"
    t.index ["business_id"], name: "index_promotions_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['percent'::character varying, 'fixed'::character varying, 'happy_hour'::character varying, 'coupon'::character varying]::text[])", name: "promotions_kind_check"
  end

  create_table "purchase_order_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "purchase_order_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "unit_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, null: false
    t.decimal "base_quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.bigint "unit_cost_minor", default: 0, null: false
    t.decimal "received_base_qty", precision: 20, scale: 9, default: "0.0", null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_purchase_order_lines_on_business_id"
    t.index ["purchase_order_id"], name: "index_purchase_order_lines_on_purchase_order_id"
    t.index ["stock_item_id"], name: "index_purchase_order_lines_on_stock_item_id"
    t.index ["unit_id"], name: "index_purchase_order_lines_on_unit_id"
  end

  create_table "purchase_orders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "supplier_id", null: false
    t.integer "number", null: false
    t.string "status", default: "draft", null: false
    t.date "expected_on"
    t.bigint "total_minor", default: 0, null: false
    t.text "note"
    t.uuid "by_membership_id"
    t.datetime "sent_at"
    t.datetime "received_at"
    t.datetime "cancelled_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "paid_minor", default: 0, null: false
    t.index ["branch_id"], name: "index_purchase_orders_on_branch_id"
    t.index ["business_id", "number"], name: "index_purchase_orders_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_purchase_orders_on_business_id"
    t.index ["supplier_id"], name: "index_purchase_orders_on_supplier_id"
    t.check_constraint "status::text = ANY (ARRAY['draft'::character varying, 'sent'::character varying, 'partial'::character varying, 'received'::character varying, 'cancelled'::character varying]::text[])", name: "purchase_orders_status_check"
  end

  create_table "purchase_return_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "purchase_return_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "unit_id", null: false
    t.decimal "quantity", precision: 14, scale: 3, null: false
    t.decimal "base_quantity", precision: 14, scale: 3, default: "0.0", null: false
    t.bigint "unit_cost_minor", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_purchase_return_lines_on_business_id"
    t.index ["purchase_return_id"], name: "index_purchase_return_lines_on_purchase_return_id"
    t.index ["stock_item_id"], name: "index_purchase_return_lines_on_stock_item_id"
    t.index ["unit_id"], name: "index_purchase_return_lines_on_unit_id"
  end

  create_table "purchase_returns", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "supplier_id", null: false
    t.uuid "goods_receipt_id"
    t.uuid "stock_document_id"
    t.uuid "stock_section_id"
    t.integer "number", null: false
    t.string "status", default: "posted", null: false
    t.string "reason"
    t.string "settlement", default: "credit_note", null: false
    t.bigint "amount_minor", default: 0, null: false
    t.uuid "payment_method_id"
    t.uuid "payment_account_id"
    t.date "returned_on", null: false
    t.date "business_day"
    t.uuid "by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_purchase_returns_on_branch_id"
    t.index ["business_id", "number"], name: "index_purchase_returns_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_purchase_returns_on_business_id"
    t.index ["goods_receipt_id"], name: "index_purchase_returns_on_goods_receipt_id"
    t.index ["stock_document_id"], name: "index_purchase_returns_on_stock_document_id"
    t.index ["stock_section_id"], name: "index_purchase_returns_on_stock_section_id"
    t.index ["supplier_id"], name: "index_purchase_returns_on_supplier_id"
    t.check_constraint "settlement::text = ANY (ARRAY['credit_note'::character varying, 'cash_refund'::character varying]::text[])", name: "purchase_returns_settlement_check"
  end

  create_table "push_subscriptions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "membership_id", null: false
    t.uuid "device_id"
    t.string "app", default: "admin", null: false
    t.text "endpoint", null: false
    t.string "p256dh", null: false
    t.string "auth", null: false
    t.string "user_agent"
    t.integer "failed_count", default: 0, null: false
    t.datetime "last_used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_push_subscriptions_on_business_id"
    t.index ["endpoint"], name: "index_push_subscriptions_on_endpoint", unique: true
    t.index ["membership_id"], name: "index_push_subscriptions_on_membership_id"
    t.check_constraint "app::text = ANY (ARRAY['admin'::character varying, 'pos'::character varying, 'kitchen'::character varying, 'rider'::character varying]::text[])", name: "push_subscriptions_app_check"
  end

  create_table "quick_add_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id", null: false
    t.uuid "variant_id"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "product_id", "variant_id"], name: "idx_on_business_id_product_id_variant_id_eef9e3fd26", unique: true, nulls_not_distinct: true
    t.index ["business_id"], name: "index_quick_add_items_on_business_id"
    t.index ["product_id"], name: "index_quick_add_items_on_product_id"
  end

  create_table "receipt_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.string "kind", null: false
    t.uuid "membership_id"
    t.uuid "device_id"
    t.string "channel"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_receipt_events_on_business_id"
    t.index ["order_id"], name: "index_receipt_events_on_order_id"
  end

  create_table "recipe_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "recipe_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "unit_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, null: false
    t.decimal "base_quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.decimal "waste_percent", precision: 5, scale: 2, default: "0.0", null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_recipe_lines_on_business_id"
    t.index ["recipe_id"], name: "index_recipe_lines_on_recipe_id"
    t.index ["stock_item_id"], name: "index_recipe_lines_on_stock_item_id"
    t.index ["unit_id"], name: "index_recipe_lines_on_unit_id"
  end

  create_table "recipes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "product_id"
    t.uuid "variant_id"
    t.string "name", null: false
    t.decimal "yield_qty", precision: 14, scale: 3, default: "1.0", null: false
    t.uuid "yield_unit_id"
    t.uuid "output_stock_item_id"
    t.uuid "source_section_id"
    t.bigint "cost_minor", default: 0, null: false
    t.text "notes"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "output_stock_item_id"], name: "idx_recipes_one_per_output_item", unique: true, where: "((archived_at IS NULL) AND (output_stock_item_id IS NOT NULL))"
    t.index ["business_id", "product_id", "variant_id"], name: "idx_recipes_one_per_product_variant", unique: true, where: "((archived_at IS NULL) AND (product_id IS NOT NULL))"
    t.index ["business_id"], name: "index_recipes_on_business_id"
    t.index ["output_stock_item_id"], name: "index_recipes_on_output_stock_item_id"
    t.index ["product_id"], name: "index_recipes_on_product_id"
    t.index ["source_section_id"], name: "index_recipes_on_source_section_id"
    t.index ["variant_id"], name: "index_recipes_on_variant_id"
    t.index ["yield_unit_id"], name: "index_recipes_on_yield_unit_id"
  end

  create_table "refresh_tokens", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "user_id"
    t.uuid "membership_id"
    t.uuid "device_id"
    t.string "token_digest", null: false
    t.string "app", default: "admin", null: false
    t.datetime "expires_at", null: false
    t.datetime "revoked_at"
    t.string "user_agent"
    t.string "ip"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["device_id"], name: "index_refresh_tokens_on_device_id"
    t.index ["membership_id"], name: "index_refresh_tokens_on_membership_id"
    t.index ["token_digest"], name: "index_refresh_tokens_on_token_digest", unique: true
    t.index ["user_id"], name: "index_refresh_tokens_on_user_id"
  end

  create_table "refunds", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "order_id", null: false
    t.uuid "payment_id"
    t.uuid "payment_method_id", null: false
    t.uuid "payment_account_id"
    t.bigint "amount_minor", null: false
    t.string "reason", null: false
    t.uuid "by_membership_id"
    t.uuid "approved_by_membership_id"
    t.uuid "shift_id"
    t.date "business_day", null: false
    t.datetime "refunded_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_refunds_on_business_id"
    t.index ["order_id"], name: "index_refunds_on_order_id"
    t.index ["payment_account_id"], name: "index_refunds_on_payment_account_id"
    t.index ["payment_method_id"], name: "index_refunds_on_payment_method_id"
  end

  create_table "regular_discount_tiers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.integer "within_days", null: false
    t.string "kind", default: "percent", null: false
    t.decimal "value", precision: 12, scale: 2, null: false
    t.bigint "min_order_minor", default: 0, null: false
    t.uuid "excluded_product_ids", default: [], null: false, array: true
    t.uuid "excluded_category_ids", default: [], null: false, array: true
    t.string "excluded_order_types", default: [], null: false, array: true
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_regular_discount_tiers_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['percent'::character varying, 'fixed'::character varying]::text[])", name: "regular_discount_tiers_kind_check"
  end

  create_table "report_schedules", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "name", null: false
    t.string "kind", null: false
    t.string "cadence", default: "daily", null: false
    t.integer "hour", default: 9, null: false
    t.integer "weekday", default: 1, null: false
    t.integer "day_of_month", default: 1, null: false
    t.string "channel", default: "whatsapp", null: false
    t.text "recipients", default: [], null: false, array: true
    t.boolean "active", default: true, null: false
    t.datetime "last_run_at"
    t.datetime "next_run_at"
    t.text "last_error"
    t.uuid "created_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active", "next_run_at"], name: "index_report_schedules_on_active_and_next_run_at"
    t.index ["branch_id"], name: "index_report_schedules_on_branch_id"
    t.index ["business_id"], name: "index_report_schedules_on_business_id"
    t.check_constraint "cadence::text = ANY (ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying]::text[])", name: "report_schedules_cadence_check"
    t.check_constraint "channel::text = ANY (ARRAY['whatsapp'::character varying, 'email'::character varying, 'both'::character varying]::text[])", name: "report_schedules_channel_check"
    t.check_constraint "kind::text = ANY (ARRAY['daily_summary'::character varying, 'sales'::character varying, 'items'::character varying, 'cashiers'::character varying, 'grand'::character varying, 'stock_sheet'::character varying, 'expenses'::character varying, 'payables'::character varying, 'khata'::character varying]::text[])", name: "report_schedules_kind_check"
  end

  create_table "reservations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "table_id"
    t.uuid "customer_id"
    t.string "guest_name", null: false
    t.string "phone"
    t.integer "party_size", default: 2, null: false
    t.datetime "starts_at", null: false
    t.datetime "ends_at", null: false
    t.bigint "deposit_minor", default: 0, null: false
    t.uuid "deposit_payment_id"
    t.string "status", default: "booked", null: false
    t.text "notes"
    t.datetime "reminder_sent_at"
    t.datetime "seated_at"
    t.uuid "order_id"
    t.uuid "by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "starts_at"], name: "index_reservations_on_branch_id_and_starts_at"
    t.index ["branch_id"], name: "index_reservations_on_branch_id"
    t.index ["business_id"], name: "index_reservations_on_business_id"
    t.index ["customer_id"], name: "index_reservations_on_customer_id"
    t.index ["table_id"], name: "index_reservations_on_table_id"
    t.check_constraint "status::text = ANY (ARRAY['booked'::character varying, 'confirmed'::character varying, 'seated'::character varying, 'completed'::character varying, 'no_show'::character varying, 'cancelled'::character varying]::text[])", name: "reservations_status_check"
  end

  create_table "reviews", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "order_id"
    t.uuid "customer_id"
    t.integer "rating"
    t.text "comment"
    t.string "source", default: "tablet", null: false
    t.string "order_type"
    t.bigint "order_total_minor", default: 0, null: false
    t.datetime "rated_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "created_at"], name: "index_reviews_on_business_id_and_created_at"
    t.index ["business_id"], name: "index_reviews_on_business_id"
    t.index ["order_id"], name: "index_reviews_on_order_id"
    t.check_constraint "rating IS NULL OR rating >= 1 AND rating <= 5", name: "reviews_rating_check"
    t.check_constraint "source::text = ANY (ARRAY['tablet'::character varying, 'website'::character varying, 'pos'::character varying, 'qr'::character varying]::text[])", name: "reviews_source_check"
  end

  create_table "rider_cash_movements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "rider_id", null: false
    t.string "kind", null: false
    t.bigint "amount_minor", null: false
    t.string "reason"
    t.uuid "payment_account_id"
    t.uuid "expense_id"
    t.uuid "settlement_id"
    t.uuid "shift_id"
    t.uuid "by_membership_id"
    t.date "business_day", null: false
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.index ["business_id"], name: "index_rider_cash_movements_on_business_id"
    t.index ["rider_id", "occurred_at"], name: "index_rider_cash_movements_on_rider_id_and_occurred_at"
    t.index ["rider_id"], name: "index_rider_cash_movements_on_rider_id"
    t.check_constraint "kind::text = ANY (ARRAY['issue'::character varying, 'return'::character varying, 'spend'::character varying, 'adjust'::character varying, 'settle'::character varying]::text[])", name: "rider_cash_movements_kind_check"
  end

  create_table "rider_settlements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "rider_id", null: false
    t.uuid "shift_id"
    t.integer "number", null: false
    t.integer "deliveries_count", default: 0, null: false
    t.bigint "cash_collected_minor", default: 0, null: false
    t.bigint "float_held_minor", default: 0, null: false
    t.bigint "spent_minor", default: 0, null: false
    t.bigint "expected_minor", default: 0, null: false
    t.bigint "handed_in_minor", default: 0, null: false
    t.bigint "difference_minor", default: 0, null: false
    t.uuid "payment_account_id"
    t.text "note"
    t.uuid "settled_by_membership_id"
    t.datetime "settled_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "number"], name: "index_rider_settlements_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_rider_settlements_on_business_id"
    t.index ["rider_id"], name: "index_rider_settlements_on_rider_id"
  end

  create_table "riders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "membership_id"
    t.string "name", null: false
    t.string "phone"
    t.string "vehicle"
    t.string "vehicle_no"
    t.text "address"
    t.bigint "charge_per_delivery_minor", default: 0, null: false
    t.bigint "float_minor", default: 0, null: false
    t.string "status", default: "available", null: false
    t.decimal "last_lat", precision: 10, scale: 7
    t.decimal "last_lng", precision: 10, scale: 7
    t.datetime "last_seen_at"
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "temporary", default: false, null: false
    t.string "lifetime_kind"
    t.integer "lifetime_value"
    t.datetime "expires_at"
    t.integer "orders_allowed"
    t.integer "orders_used", default: 0, null: false
    t.jsonb "permissions", default: [], null: false
    t.uuid "created_by_membership_id"
    t.index ["branch_id"], name: "index_riders_on_branch_id"
    t.index ["business_id", "membership_id"], name: "index_riders_on_business_id_and_membership_id", unique: true, where: "(membership_id IS NOT NULL)"
    t.index ["business_id"], name: "index_riders_on_business_id"
    t.index ["membership_id"], name: "index_riders_on_membership_id"
    t.check_constraint "lifetime_kind IS NULL OR (lifetime_kind::text = ANY (ARRAY['one_order'::character varying, 'n_orders'::character varying, 'rest_of_today'::character varying, 'n_hours'::character varying]::text[]))", name: "riders_lifetime_kind_check"
  end

  create_table "role_permissions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "role_id", null: false
    t.string "permission_code", null: false
    t.decimal "limit_value", precision: 10, scale: 2
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_role_permissions_on_business_id"
    t.index ["role_id", "permission_code"], name: "index_role_permissions_on_role_id_and_permission_code", unique: true
    t.index ["role_id"], name: "index_role_permissions_on_role_id"
  end

  create_table "roles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "system_key"
    t.boolean "is_system", default: false, null: false
    t.uuid "copied_from_role_id"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "name"], name: "index_roles_on_business_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["business_id"], name: "index_roles_on_business_id"
  end

  create_table "safety_net_runs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "trigger", default: "job", null: false
    t.uuid "by_membership_id"
    t.datetime "ran_at", null: false
    t.integer "checked", default: 0, null: false
    t.integer "deducted", default: 0, null: false
    t.integer "errors_count", default: 0, null: false
    t.jsonb "detail", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "ran_at"], name: "index_safety_net_runs_on_business_id_and_ran_at"
    t.index ["business_id"], name: "index_safety_net_runs_on_business_id"
  end

  create_table "salary_components", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.bigint "default_amount_minor", default: 0, null: false
    t.boolean "is_percent", default: false, null: false
    t.decimal "percent", precision: 6, scale: 2
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_salary_components_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['earning'::character varying, 'deduction'::character varying]::text[])", name: "salary_components_kind_check"
  end

  create_table "settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.string "key", null: false
    t.jsonb "value"
    t.uuid "updated_by_user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "branch_id", "key"], name: "index_settings_on_business_id_and_branch_id_and_key", unique: true, nulls_not_distinct: true
    t.index ["business_id"], name: "index_settings_on_business_id"
  end

  create_table "setup_checklist_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "key", null: false
    t.string "title", null: false
    t.datetime "done_at"
    t.boolean "plan_feature_off", default: false, null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "key"], name: "index_setup_checklist_items_on_business_id_and_key", unique: true
    t.index ["business_id"], name: "index_setup_checklist_items_on_business_id"
  end

  create_table "shifts", id: :uuid, default: nil, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "device_id"
    t.uuid "cashier_membership_id", null: false
    t.uuid "drawer_account_id"
    t.date "business_day", null: false
    t.datetime "opened_at", null: false
    t.bigint "opening_cash_minor", default: 0, null: false
    t.datetime "closed_at"
    t.bigint "expected_cash_minor"
    t.bigint "counted_cash_minor"
    t.bigint "over_short_minor"
    t.jsonb "count_detail", default: {}, null: false
    t.uuid "approved_by_membership_id"
    t.string "status", default: "open", null: false
    t.string "settlement_status", default: "pending", null: false
    t.jsonb "z_report", default: {}, null: false
    t.text "close_note"
    t.datetime "client_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_shifts_on_branch_id"
    t.index ["business_id", "branch_id", "business_day"], name: "index_shifts_on_business_id_and_branch_id_and_business_day"
    t.index ["business_id"], name: "index_shifts_on_business_id"
    t.index ["cashier_membership_id"], name: "idx_shifts_one_open_per_cashier", unique: true, where: "((status)::text = 'open'::text)"
    t.check_constraint "settlement_status::text = ANY (ARRAY['pending'::character varying, 'settled'::character varying]::text[])", name: "shifts_settlement_check"
    t.check_constraint "status::text = ANY (ARRAY['open'::character varying, 'closed'::character varying, 'force_closed'::character varying]::text[])", name: "shifts_status_check"
  end

  create_table "solid_queue_batch_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "batch_id", null: false
    t.datetime "created_at", null: false
    t.index ["batch_id"], name: "index_solid_queue_batch_executions_on_batch_id"
    t.index ["job_id"], name: "index_solid_queue_batch_executions_on_job_id", unique: true
  end

  create_table "solid_queue_batches", force: :cascade do |t|
    t.string "active_job_batch_id"
    t.string "description"
    t.text "on_finish"
    t.text "on_success"
    t.text "on_failure"
    t.text "metadata"
    t.integer "total_jobs", default: 0, null: false
    t.integer "completed_jobs", default: 0, null: false
    t.integer "failed_jobs", default: 0, null: false
    t.datetime "enqueued_at"
    t.datetime "finished_at"
    t.datetime "failed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active_job_batch_id"], name: "index_solid_queue_batches_on_active_job_batch_id", unique: true
    t.index ["finished_at"], name: "index_solid_queue_batches_on_finished_at"
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.string "concurrency_key", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.text "error"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "queue_name", null: false
    t.string "class_name", null: false
    t.text "arguments"
    t.integer "priority", default: 0, null: false
    t.string "active_job_id"
    t.datetime "scheduled_at"
    t.datetime "finished_at"
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "batch_id"
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["batch_id"], name: "index_solid_queue_jobs_on_batch_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.string "queue_name", null: false
    t.datetime "created_at", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.bigint "supervisor_id"
    t.integer "pid", null: false
    t.string "hostname"
    t.text "metadata"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "task_key", null: false
    t.datetime "run_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.string "key", null: false
    t.string "schedule", null: false
    t.string "command", limit: 2048
    t.string "class_name"
    t.text "arguments"
    t.string "queue_name"
    t.integer "priority", default: 0
    t.boolean "static", default: true, null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "scheduled_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.string "key", null: false
    t.integer "value", default: 1, null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "stations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "name", null: false
    t.string "printer_name"
    t.uuid "display_device_id"
    t.integer "sort_order", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_stations_on_branch_id"
    t.index ["business_id"], name: "index_stations_on_business_id"
  end

  create_table "stock_document_lines", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "stock_document_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "unit_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.decimal "base_quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.bigint "unit_cost_minor"
    t.string "batch_no"
    t.date "expires_on"
    t.decimal "counted_qty", precision: 20, scale: 9
    t.decimal "expected_qty", precision: 20, scale: 9
    t.string "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_stock_document_lines_on_business_id"
    t.index ["stock_document_id"], name: "index_stock_document_lines_on_stock_document_id"
    t.index ["stock_item_id"], name: "index_stock_document_lines_on_stock_item_id"
    t.index ["unit_id"], name: "index_stock_document_lines_on_unit_id"
  end

  create_table "stock_documents", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.integer "number", null: false
    t.string "kind", null: false
    t.string "status", default: "draft", null: false
    t.uuid "from_section_id"
    t.uuid "to_section_id"
    t.uuid "supplier_id"
    t.uuid "goods_receipt_id"
    t.uuid "client_id"
    t.string "reason"
    t.string "invoice_ref"
    t.text "note"
    t.date "business_day"
    t.datetime "posted_at"
    t.datetime "cancelled_at"
    t.uuid "by_membership_id"
    t.uuid "posted_by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "approved_by_membership_id"
    t.datetime "dispatched_at"
    t.datetime "received_at"
    t.uuid "purchase_order_id"
    t.date "posting_date"
    t.index ["branch_id", "business_day", "kind"], name: "index_stock_documents_on_branch_id_and_business_day_and_kind"
    t.index ["branch_id"], name: "index_stock_documents_on_branch_id"
    t.index ["business_id", "client_id"], name: "index_stock_documents_on_business_id_and_client_id", unique: true, where: "(client_id IS NOT NULL)"
    t.index ["business_id", "kind", "number"], name: "index_stock_documents_on_business_id_and_kind_and_number", unique: true
    t.index ["business_id"], name: "index_stock_documents_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['receive'::character varying, 'po_receipt'::character varying, 'transfer'::character varying, 'waste'::character varying, 'adjustment'::character varying, 'count'::character varying, 'opening_balance'::character varying, 'production'::character varying, 'supplier_return'::character varying]::text[])", name: "stock_documents_kind_check"
    t.check_constraint "status::text = ANY (ARRAY['draft'::character varying, 'awaiting_approval'::character varying, 'in_transit'::character varying, 'posted'::character varying, 'voided'::character varying, 'cancelled'::character varying]::text[])", name: "stock_documents_status_check"
  end

  create_table "stock_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "name_ur"
    t.string "sku"
    t.string "category"
    t.uuid "base_unit_id", null: false
    t.uuid "purchase_unit_id"
    t.decimal "minimum_qty", precision: 20, scale: 9, default: "0.0", null: false
    t.decimal "reorder_qty", precision: 20, scale: 9, default: "0.0", null: false
    t.decimal "avg_cost_minor_per_base", precision: 18, scale: 6, default: "0.0", null: false
    t.boolean "track_expiry", default: false, null: false
    t.string "barcode"
    t.boolean "is_packaging", default: false, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "active", default: true, null: false
    t.index ["base_unit_id"], name: "index_stock_items_on_base_unit_id"
    t.index ["business_id", "name"], name: "index_stock_items_on_business_id_and_name"
    t.index ["business_id", "sku"], name: "index_stock_items_on_business_id_and_sku", unique: true, where: "((sku IS NOT NULL) AND (archived_at IS NULL))"
    t.index ["business_id"], name: "index_stock_items_on_business_id"
    t.index ["purchase_unit_id"], name: "index_stock_items_on_purchase_unit_id"
  end

  create_table "stock_ledger_entries", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "stock_section_id", null: false
    t.uuid "stock_item_id", null: false
    t.date "business_day", null: false
    t.string "kind", null: false
    t.decimal "quantity", precision: 20, scale: 9, null: false
    t.decimal "before_qty", precision: 20, scale: 9, null: false
    t.decimal "after_qty", precision: 20, scale: 9, null: false
    t.decimal "unit_cost_minor", precision: 18, scale: 6, default: "0.0", null: false
    t.bigint "value_minor", default: 0, null: false
    t.string "ref_table"
    t.uuid "ref_id"
    t.string "reason"
    t.uuid "punched_by_membership_id"
    t.uuid "completed_by_membership_id"
    t.uuid "reversed_by_entry_id"
    t.uuid "reverses_entry_id"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.uuid "ref_line_id"
    t.index ["branch_id"], name: "index_stock_ledger_entries_on_branch_id"
    t.index ["business_id", "ref_id"], name: "index_stock_ledger_entries_on_business_id_and_ref_id"
    t.index ["business_id", "stock_item_id", "occurred_at"], name: "idx_on_business_id_stock_item_id_occurred_at_e2880c1350"
    t.index ["business_id"], name: "index_stock_ledger_entries_on_business_id"
    t.index ["ref_line_id"], name: "index_stock_ledger_entries_on_ref_line_id"
    t.index ["ref_table", "ref_id", "ref_line_id", "stock_item_id", "stock_section_id", "kind"], name: "index_stock_ledger_sale_deductions_unique", unique: true, where: "(((kind)::text = ANY ((ARRAY['sale'::character varying, 'packaging'::character varying])::text[])) AND (ref_id IS NOT NULL) AND (reversed_by_entry_id IS NULL) AND (reverses_entry_id IS NULL))", nulls_not_distinct: true
    t.index ["stock_item_id"], name: "index_stock_ledger_entries_on_stock_item_id"
    t.index ["stock_section_id", "business_day"], name: "idx_on_stock_section_id_business_day_24988e1b54"
    t.index ["stock_section_id"], name: "index_stock_ledger_entries_on_stock_section_id"
    t.check_constraint "kind::text = ANY (ARRAY['sale'::character varying, 'sale_return'::character varying, 'receive'::character varying, 'transfer_in'::character varying, 'transfer_out'::character varying, 'waste'::character varying, 'adjustment'::character varying, 'count'::character varying, 'production_in'::character varying, 'production_out'::character varying, 'supplier_return'::character varying, 'packaging'::character varying, 'opening'::character varying]::text[])", name: "stock_ledger_kind_check"
  end

  create_table "stock_levels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "stock_section_id", null: false
    t.uuid "stock_item_id", null: false
    t.decimal "quantity", precision: 20, scale: 9, default: "0.0", null: false
    t.bigint "value_minor", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_stock_levels_on_business_id"
    t.index ["stock_item_id"], name: "index_stock_levels_on_stock_item_id"
    t.index ["stock_section_id", "stock_item_id"], name: "index_stock_levels_on_stock_section_id_and_stock_item_id", unique: true
    t.index ["stock_section_id"], name: "index_stock_levels_on_stock_section_id"
  end

  create_table "stock_sections", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.string "name", null: false
    t.integer "sort_order", default: 0, null: false
    t.boolean "is_default", default: false, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "is_system", default: false, null: false
    t.boolean "cogs_primary", default: false, null: false
    t.string "slug"
    t.index ["branch_id", "name"], name: "index_stock_sections_on_branch_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["branch_id", "slug"], name: "index_stock_sections_on_branch_id_and_slug", unique: true, where: "(archived_at IS NULL)"
    t.index ["branch_id"], name: "index_stock_sections_on_branch_id"
    t.index ["business_id"], name: "index_stock_sections_on_business_id"
  end

  create_table "subscriptions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "plan_id", null: false
    t.string "billing_cycle", default: "monthly", null: false
    t.string "status", default: "trialing", null: false
    t.datetime "current_period_start"
    t.datetime "current_period_end"
    t.string "provider", default: "manual", null: false
    t.string "provider_ref"
    t.date "grace_ends_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "cancelled_at"
    t.string "cancel_reason"
    t.integer "tills", default: 1, null: false
    t.index ["business_id"], name: "index_subscriptions_on_business_id"
    t.index ["plan_id"], name: "index_subscriptions_on_plan_id"
  end

  create_table "super_admins", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "email", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.datetime "last_login_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_super_admins_on_email", unique: true
  end

  create_table "supplier_adjustments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "supplier_id", null: false
    t.bigint "amount_minor", null: false
    t.string "reason", null: false
    t.date "business_day", null: false
    t.uuid "by_membership_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_supplier_adjustments_on_business_id"
    t.index ["supplier_id"], name: "index_supplier_adjustments_on_supplier_id"
  end

  create_table "supplier_payments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "supplier_id", null: false
    t.uuid "goods_receipt_id"
    t.integer "number", null: false
    t.string "direction", default: "paid", null: false
    t.bigint "amount_minor", null: false
    t.uuid "payment_method_id"
    t.uuid "payment_account_id"
    t.string "reference"
    t.text "note"
    t.date "paid_on", null: false
    t.date "business_day", null: false
    t.uuid "by_membership_id"
    t.uuid "shift_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "purchase_order_id"
    t.index ["branch_id"], name: "index_supplier_payments_on_branch_id"
    t.index ["business_id", "number"], name: "index_supplier_payments_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_supplier_payments_on_business_id"
    t.index ["goods_receipt_id"], name: "index_supplier_payments_on_goods_receipt_id"
    t.index ["purchase_order_id"], name: "index_supplier_payments_on_purchase_order_id"
    t.index ["supplier_id"], name: "index_supplier_payments_on_supplier_id"
    t.check_constraint "direction::text = ANY (ARRAY['paid'::character varying, 'received'::character varying]::text[])", name: "supplier_payments_direction_check"
  end

  create_table "supplier_price_history", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "supplier_id", null: false
    t.uuid "stock_item_id", null: false
    t.uuid "goods_receipt_id"
    t.uuid "unit_id"
    t.bigint "unit_cost_minor", null: false
    t.decimal "base_unit_cost_minor", precision: 18, scale: 6, default: "0.0", null: false
    t.date "observed_on", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "stock_item_id", "observed_on"], name: "idx_on_business_id_stock_item_id_observed_on_4ada0e41b5"
    t.index ["business_id"], name: "index_supplier_price_history_on_business_id"
    t.index ["goods_receipt_id"], name: "index_supplier_price_history_on_goods_receipt_id"
    t.index ["stock_item_id"], name: "index_supplier_price_history_on_stock_item_id"
    t.index ["supplier_id"], name: "index_supplier_price_history_on_supplier_id"
    t.index ["unit_id"], name: "index_supplier_price_history_on_unit_id"
  end

  create_table "suppliers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "contact_name"
    t.string "phone"
    t.string "email"
    t.text "address"
    t.string "ntn"
    t.bigint "opening_balance_minor", default: 0, null: false
    t.bigint "balance_minor", default: 0, null: false
    t.integer "payment_terms_days", default: 0, null: false
    t.text "notes"
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "name"], name: "index_suppliers_on_business_id_and_name", unique: true, where: "(archived_at IS NULL)"
    t.index ["business_id"], name: "index_suppliers_on_business_id"
  end

  create_table "support_requests", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "membership_id"
    t.string "category", default: "question", null: false
    t.string "subject", null: false
    t.text "message", null: false
    t.string "status", default: "open", null: false
    t.text "reply"
    t.uuid "replied_by_super_admin_id"
    t.datetime "replied_at"
    t.datetime "closed_at"
    t.string "page"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "status"], name: "index_support_requests_on_business_id_and_status"
    t.index ["business_id"], name: "index_support_requests_on_business_id"
    t.index ["status", "created_at"], name: "index_support_requests_on_status_and_created_at"
    t.check_constraint "category::text = ANY (ARRAY['question'::character varying, 'problem'::character varying, 'billing'::character varying, 'feature'::character varying, 'other'::character varying]::text[])", name: "support_requests_category_check"
    t.check_constraint "status::text = ANY (ARRAY['open'::character varying, 'answered'::character varying, 'closed'::character varying]::text[])", name: "support_requests_status_check"
  end

  create_table "support_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "super_admin_id", null: false
    t.string "reason", null: false
    t.string "status", default: "requested", null: false
    t.uuid "approved_by_membership_id"
    t.datetime "approved_at"
    t.datetime "expires_at"
    t.datetime "ended_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "status"], name: "index_support_sessions_on_business_id_and_status"
    t.index ["business_id"], name: "index_support_sessions_on_business_id"
  end

  create_table "sync_batches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "device_id", null: false
    t.string "direction", null: false
    t.integer "record_count", default: 0, null: false
    t.integer "accepted", default: 0, null: false
    t.integer "duplicates", default: 0, null: false
    t.integer "rejected", default: 0, null: false
    t.string "cursor_before"
    t.string "cursor_after"
    t.datetime "started_at", null: false
    t.datetime "finished_at"
    t.text "error"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "device_id", "started_at"], name: "index_sync_batches_on_business_id_and_device_id_and_started_at"
    t.index ["business_id"], name: "index_sync_batches_on_business_id"
  end

  create_table "sync_rejections", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "device_id", null: false
    t.uuid "sync_batch_id"
    t.string "record_type", null: false
    t.uuid "record_id", null: false
    t.string "code", null: false
    t.text "message"
    t.jsonb "payload", default: {}, null: false
    t.datetime "resolved_at"
    t.uuid "resolved_by_membership_id"
    t.string "resolution"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "resolved_at"], name: "index_sync_rejections_on_business_id_and_resolved_at"
    t.index ["business_id"], name: "index_sync_rejections_on_business_id"
  end

  create_table "table_requests", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "table_id", null: false
    t.string "kind", null: false
    t.string "guest_name"
    t.text "note"
    t.datetime "requested_at", null: false
    t.uuid "handled_by_membership_id"
    t.datetime "handled_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id", "handled_at"], name: "index_table_requests_on_branch_id_and_handled_at"
    t.index ["branch_id"], name: "index_table_requests_on_branch_id"
    t.index ["business_id"], name: "index_table_requests_on_business_id"
    t.index ["table_id"], name: "index_table_requests_on_table_id"
    t.check_constraint "kind::text = ANY (ARRAY['call_waiter'::character varying, 'ask_bill'::character varying]::text[])", name: "table_requests_kind_check"
  end

  create_table "tax_invoices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id", null: false
    t.uuid "order_id", null: false
    t.string "authority", null: false
    t.jsonb "request_payload", default: {}, null: false
    t.jsonb "response_payload", default: {}, null: false
    t.string "invoice_number"
    t.text "qr_payload"
    t.string "status", default: "queued", null: false
    t.integer "attempts", default: 0, null: false
    t.text "last_error"
    t.datetime "next_attempt_at"
    t.datetime "sent_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["branch_id"], name: "index_tax_invoices_on_branch_id"
    t.index ["business_id", "status"], name: "index_tax_invoices_on_business_id_and_status"
    t.index ["business_id"], name: "index_tax_invoices_on_business_id"
    t.index ["order_id"], name: "index_tax_invoices_on_order_id", unique: true
    t.check_constraint "status::text = ANY (ARRAY['queued'::character varying, 'sent'::character varying, 'accepted'::character varying, 'failed'::character varying, 'skipped'::character varying]::text[])", name: "tax_invoices_status_check"
  end

  create_table "tax_rates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.decimal "rate", precision: 6, scale: 3, default: "0.0", null: false
    t.boolean "inclusive", default: false, null: false
    t.string "authority", default: "none", null: false
    t.boolean "active", default: true, null: false
    t.boolean "is_default", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "payment_account_id"
    t.index ["business_id"], name: "index_tax_rates_on_business_id"
  end

  create_table "unit_conversions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "from_unit_id", null: false
    t.uuid "to_unit_id", null: false
    t.decimal "factor", precision: 18, scale: 9, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_unit_conversions_on_business_id"
    t.index ["from_unit_id", "to_unit_id"], name: "index_unit_conversions_on_from_unit_id_and_to_unit_id", unique: true
  end

  create_table "units", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "code", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.decimal "factor_to_base", precision: 18, scale: 9, default: "1.0", null: false
    t.boolean "is_base", default: false, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "code"], name: "index_units_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_units_on_business_id"
    t.check_constraint "kind::text = ANY (ARRAY['weight'::character varying, 'volume'::character varying, 'count'::character varying]::text[])", name: "units_kind_check"
  end

  create_table "user_permissions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "membership_id", null: false
    t.string "permission_code", null: false
    t.datetime "granted_at", null: false
    t.uuid "granted_by_user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_user_permissions_on_business_id"
    t.index ["membership_id", "permission_code"], name: "index_user_permissions_on_membership_id_and_permission_code", unique: true
    t.index ["membership_id"], name: "index_user_permissions_on_membership_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "phone"
    t.string "email"
    t.string "name", null: false
    t.string "password_digest"
    t.string "locale", default: "en", null: false
    t.boolean "two_factor_enabled", default: false, null: false
    t.datetime "last_login_at"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true, where: "(email IS NOT NULL)"
    t.index ["phone"], name: "index_users_on_phone", unique: true, where: "(phone IS NOT NULL)"
  end

  create_table "vapid_keypairs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "public_key", null: false
    t.text "private_key", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "voids", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "order_id", null: false
    t.uuid "order_item_id"
    t.string "reason", null: false
    t.string "stock_action", default: "none", null: false
    t.bigint "amount_minor", default: 0, null: false
    t.uuid "by_membership_id"
    t.uuid "approved_by_membership_id"
    t.datetime "voided_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_voids_on_business_id"
    t.index ["order_id"], name: "index_voids_on_order_id"
  end

  create_table "voucher_batches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "name", null: false
    t.string "kind", null: false
    t.string "value_kind", default: "fixed", null: false
    t.decimal "value", precision: 12, scale: 2, null: false
    t.bigint "min_spend_minor", default: 0, null: false
    t.date "expires_on"
    t.integer "usage_limit"
    t.string "public_code"
    t.integer "issued_count", default: 0, null: false
    t.integer "redeemed_count", default: 0, null: false
    t.boolean "active", default: true, null: false
    t.uuid "created_by_membership_id"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "public_code"], name: "index_voucher_batches_on_business_id_and_public_code", unique: true, where: "(public_code IS NOT NULL)"
    t.index ["business_id"], name: "index_voucher_batches_on_business_id"
    t.check_constraint "(kind::text = ANY (ARRAY['personal'::character varying, 'public'::character varying]::text[])) AND (value_kind::text = ANY (ARRAY['fixed'::character varying, 'percent'::character varying]::text[]))", name: "voucher_batches_kind_check"
  end

  create_table "vouchers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "voucher_batch_id", null: false
    t.string "code", null: false
    t.uuid "customer_id"
    t.uuid "redeemed_order_id"
    t.datetime "redeemed_at"
    t.datetime "sent_at"
    t.uuid "whatsapp_message_id"
    t.string "status", default: "issued", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "code"], name: "index_vouchers_on_business_id_and_code", unique: true
    t.index ["business_id"], name: "index_vouchers_on_business_id"
    t.index ["customer_id"], name: "index_vouchers_on_customer_id"
    t.index ["voucher_batch_id"], name: "index_vouchers_on_voucher_batch_id"
    t.check_constraint "status::text = ANY (ARRAY['issued'::character varying, 'redeemed'::character varying, 'void'::character varying]::text[])", name: "vouchers_status_check"
  end

  create_table "wage_payments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.uuid "branch_id"
    t.uuid "employee_id", null: false
    t.integer "number", null: false
    t.date "period_from", null: false
    t.date "period_to", null: false
    t.decimal "days_worked", precision: 6, scale: 2, default: "0.0", null: false
    t.bigint "rate_minor", default: 0, null: false
    t.bigint "gross_minor", default: 0, null: false
    t.bigint "bonus_minor", default: 0, null: false
    t.bigint "deductions_minor", default: 0, null: false
    t.bigint "advance_recovered_minor", default: 0, null: false
    t.bigint "net_minor", default: 0, null: false
    t.string "method_code"
    t.uuid "payment_account_id"
    t.uuid "expense_id"
    t.uuid "shift_id"
    t.text "note"
    t.string "status", default: "paid", null: false
    t.text "void_reason"
    t.datetime "voided_at"
    t.uuid "by_membership_id"
    t.datetime "paid_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "number"], name: "index_wage_payments_on_business_id_and_number", unique: true
    t.index ["business_id"], name: "index_wage_payments_on_business_id"
    t.index ["employee_id", "period_from", "period_to"], name: "index_wage_payments_one_paid_per_period", unique: true, where: "((status)::text = 'paid'::text)"
    t.index ["employee_id"], name: "index_wage_payments_on_employee_id"
    t.check_constraint "period_to >= period_from", name: "wage_payments_period_check"
    t.check_constraint "status::text = ANY (ARRAY['paid'::character varying, 'voided'::character varying]::text[])", name: "wage_payments_status_check"
  end

  create_table "website_configs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id", null: false
    t.string "slug"
    t.boolean "published", default: false, null: false
    t.jsonb "sections", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id"], name: "index_website_configs_on_business_id"
    t.index ["business_id"], name: "index_website_configs_unique_business", unique: true
    t.index ["slug"], name: "index_website_configs_on_slug", unique: true, where: "(slug IS NOT NULL)"
  end

  create_table "whatsapp_messages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id"
    t.uuid "customer_id"
    t.uuid "user_id"
    t.string "to_phone", null: false
    t.string "template_name", null: false
    t.jsonb "variables", default: {}, null: false
    t.string "kind", default: "utility", null: false
    t.string "status", default: "queued", null: false
    t.string "provider_message_id"
    t.string "error"
    t.datetime "sent_at"
    t.datetime "delivered_at"
    t.datetime "read_at"
    t.boolean "counted_against_plan", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "campaign_id"
    t.index ["business_id", "created_at"], name: "index_whatsapp_messages_on_business_id_and_created_at"
    t.index ["campaign_id"], name: "index_whatsapp_messages_on_campaign_id"
  end

  create_table "whatsapp_templates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "business_id"
    t.string "name", null: false
    t.string "language", default: "en", null: false
    t.string "category", default: "utility", null: false
    t.text "body", null: false
    t.string "variables", default: [], null: false, array: true
    t.string "meta_template_id"
    t.string "approval_status", default: "draft", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["business_id", "name", "language"], name: "index_whatsapp_templates_on_business_id_and_name_and_language", unique: true
  end

  add_foreign_key "account_entries", "businesses"
  add_foreign_key "account_entries", "payment_accounts"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "advances", "businesses"
  add_foreign_key "advances", "employees"
  add_foreign_key "aggregator_events", "branches"
  add_foreign_key "aggregator_events", "businesses"
  add_foreign_key "ai_insights", "businesses"
  add_foreign_key "attendance_rules", "businesses"
  add_foreign_key "attendance_rules", "employees"
  add_foreign_key "attendance_scans", "businesses"
  add_foreign_key "attendances", "branches"
  add_foreign_key "attendances", "businesses"
  add_foreign_key "attendances", "employees"
  add_foreign_key "bill_runs", "businesses"
  add_foreign_key "branches", "businesses"
  add_foreign_key "businesses", "plans"
  add_foreign_key "campaigns", "businesses"
  add_foreign_key "campaigns", "promotions"
  add_foreign_key "cash_movements", "businesses"
  add_foreign_key "cash_movements", "shifts"
  add_foreign_key "categories", "businesses"
  add_foreign_key "categories", "menus"
  add_foreign_key "checklist_runs", "branches"
  add_foreign_key "checklist_runs", "businesses"
  add_foreign_key "checklist_templates", "branches"
  add_foreign_key "checklist_templates", "businesses"
  add_foreign_key "commission_rules", "businesses"
  add_foreign_key "customer_addresses", "businesses"
  add_foreign_key "customer_addresses", "customers"
  add_foreign_key "customer_adjustments", "businesses"
  add_foreign_key "customer_adjustments", "customer_adjustments", column: "reverses_id"
  add_foreign_key "customer_adjustments", "customers"
  add_foreign_key "customer_groups", "businesses"
  add_foreign_key "customer_payments", "businesses"
  add_foreign_key "customer_payments", "customers"
  add_foreign_key "customer_payments", "payment_accounts"
  add_foreign_key "customer_payments", "payment_methods"
  add_foreign_key "customers", "businesses"
  add_foreign_key "customers", "customer_groups", column: "group_id"
  add_foreign_key "day_closes", "branches"
  add_foreign_key "day_closes", "businesses"
  add_foreign_key "day_end_settlements", "businesses"
  add_foreign_key "deal_items", "businesses"
  add_foreign_key "deal_items", "deals"
  add_foreign_key "deal_items", "products"
  add_foreign_key "deals", "businesses"
  add_foreign_key "deals", "tax_rates"
  add_foreign_key "deduction_audits", "businesses"
  add_foreign_key "deduction_audits", "orders"
  add_foreign_key "deliveries", "branches"
  add_foreign_key "deliveries", "businesses"
  add_foreign_key "deliveries", "delivery_zones", column: "zone_id"
  add_foreign_key "deliveries", "orders"
  add_foreign_key "deliveries", "riders"
  add_foreign_key "delivery_status_events", "businesses"
  add_foreign_key "delivery_status_events", "deliveries"
  add_foreign_key "delivery_zones", "branches"
  add_foreign_key "delivery_zones", "businesses"
  add_foreign_key "departments", "businesses"
  add_foreign_key "devices", "branches"
  add_foreign_key "devices", "businesses"
  add_foreign_key "dining_tables", "branches"
  add_foreign_key "dining_tables", "businesses"
  add_foreign_key "dining_tables", "floors"
  add_foreign_key "discounts_applied", "businesses"
  add_foreign_key "discounts_applied", "orders"
  add_foreign_key "employee_salary_components", "businesses"
  add_foreign_key "employee_salary_components", "employees"
  add_foreign_key "employee_salary_components", "salary_components"
  add_foreign_key "employees", "branches"
  add_foreign_key "employees", "businesses"
  add_foreign_key "employees", "departments"
  add_foreign_key "employees", "memberships"
  add_foreign_key "expense_categories", "businesses"
  add_foreign_key "expense_categories", "expense_categories", column: "parent_id"
  add_foreign_key "expenses", "branches"
  add_foreign_key "expenses", "businesses"
  add_foreign_key "expenses", "expense_categories", column: "category_id"
  add_foreign_key "fixed_assets", "businesses"
  add_foreign_key "floors", "branches"
  add_foreign_key "floors", "businesses"
  add_foreign_key "gl_accounts", "businesses"
  add_foreign_key "goods_receipt_lines", "businesses"
  add_foreign_key "goods_receipt_lines", "goods_receipts"
  add_foreign_key "goods_receipt_lines", "purchase_order_lines"
  add_foreign_key "goods_receipt_lines", "stock_items"
  add_foreign_key "goods_receipt_lines", "units"
  add_foreign_key "goods_receipts", "branches"
  add_foreign_key "goods_receipts", "businesses"
  add_foreign_key "goods_receipts", "purchase_orders"
  add_foreign_key "goods_receipts", "stock_documents"
  add_foreign_key "goods_receipts", "stock_sections"
  add_foreign_key "goods_receipts", "suppliers"
  add_foreign_key "holidays", "branches"
  add_foreign_key "holidays", "businesses"
  add_foreign_key "import_jobs", "businesses"
  add_foreign_key "inventory_settings", "businesses"
  add_foreign_key "invoices", "businesses"
  add_foreign_key "invoices", "subscriptions"
  add_foreign_key "journal_entries", "businesses"
  add_foreign_key "journal_lines", "businesses"
  add_foreign_key "kitchen_tickets", "branches"
  add_foreign_key "kitchen_tickets", "businesses"
  add_foreign_key "kitchen_tickets", "orders"
  add_foreign_key "leave_requests", "businesses"
  add_foreign_key "leave_requests", "employees"
  add_foreign_key "loyalty_redemption_options", "businesses"
  add_foreign_key "loyalty_transactions", "businesses"
  add_foreign_key "loyalty_transactions", "customers"
  add_foreign_key "loyalty_transactions", "orders"
  add_foreign_key "memberships", "businesses"
  add_foreign_key "memberships", "roles"
  add_foreign_key "memberships", "users"
  add_foreign_key "menus", "businesses"
  add_foreign_key "modifier_groups", "businesses"
  add_foreign_key "modifiers", "businesses"
  add_foreign_key "modifiers", "modifier_groups"
  add_foreign_key "notifications", "businesses"
  add_foreign_key "order_events", "businesses"
  add_foreign_key "order_events", "orders"
  add_foreign_key "order_item_modifiers", "businesses"
  add_foreign_key "order_item_modifiers", "order_items"
  add_foreign_key "order_items", "businesses"
  add_foreign_key "order_items", "orders"
  add_foreign_key "order_status_events", "businesses"
  add_foreign_key "order_status_events", "orders"
  add_foreign_key "order_type_consumables", "businesses"
  add_foreign_key "order_type_consumables", "products"
  add_foreign_key "order_type_consumables", "stock_items"
  add_foreign_key "orders", "branches"
  add_foreign_key "orders", "businesses"
  add_foreign_key "orders", "customer_addresses", column: "address_id"
  add_foreign_key "orders", "customers"
  add_foreign_key "orders", "dining_tables", column: "table_id"
  add_foreign_key "orders", "riders"
  add_foreign_key "orders", "shifts"
  add_foreign_key "overheads", "branches"
  add_foreign_key "overheads", "businesses"
  add_foreign_key "packaging_rules", "branches"
  add_foreign_key "packaging_rules", "businesses"
  add_foreign_key "packaging_rules", "stock_items"
  add_foreign_key "payment_accounts", "businesses"
  add_foreign_key "payment_methods", "businesses"
  add_foreign_key "payment_methods", "payment_accounts"
  add_foreign_key "payments", "businesses"
  add_foreign_key "payments", "orders"
  add_foreign_key "payments", "payment_accounts"
  add_foreign_key "payments", "payment_methods"
  add_foreign_key "payments", "shifts"
  add_foreign_key "payments_received", "businesses"
  add_foreign_key "payments_received", "invoices"
  add_foreign_key "payroll_runs", "branches"
  add_foreign_key "payroll_runs", "businesses"
  add_foreign_key "payslips", "businesses"
  add_foreign_key "payslips", "employees"
  add_foreign_key "payslips", "payroll_runs"
  add_foreign_key "product_barcodes", "businesses"
  add_foreign_key "product_barcodes", "product_variants", column: "variant_id", on_delete: :cascade
  add_foreign_key "product_barcodes", "products"
  add_foreign_key "product_modifier_groups", "businesses"
  add_foreign_key "product_modifier_groups", "modifier_groups"
  add_foreign_key "product_modifier_groups", "products"
  add_foreign_key "product_prices", "businesses"
  add_foreign_key "product_prices", "products"
  add_foreign_key "product_variants", "businesses"
  add_foreign_key "product_variants", "products"
  add_foreign_key "production_batches", "branches"
  add_foreign_key "production_batches", "businesses"
  add_foreign_key "production_batches", "recipes"
  add_foreign_key "production_batches", "stock_documents"
  add_foreign_key "production_batches", "stock_sections"
  add_foreign_key "products", "businesses"
  add_foreign_key "products", "categories"
  add_foreign_key "products", "tax_rates"
  add_foreign_key "promotions", "businesses"
  add_foreign_key "purchase_order_lines", "businesses"
  add_foreign_key "purchase_order_lines", "purchase_orders"
  add_foreign_key "purchase_order_lines", "stock_items"
  add_foreign_key "purchase_order_lines", "units"
  add_foreign_key "purchase_orders", "branches"
  add_foreign_key "purchase_orders", "businesses"
  add_foreign_key "purchase_orders", "suppliers"
  add_foreign_key "purchase_return_lines", "businesses"
  add_foreign_key "purchase_return_lines", "purchase_returns"
  add_foreign_key "purchase_return_lines", "stock_items"
  add_foreign_key "purchase_return_lines", "units"
  add_foreign_key "purchase_returns", "branches"
  add_foreign_key "purchase_returns", "businesses"
  add_foreign_key "purchase_returns", "goods_receipts"
  add_foreign_key "purchase_returns", "stock_documents"
  add_foreign_key "purchase_returns", "stock_sections"
  add_foreign_key "purchase_returns", "suppliers"
  add_foreign_key "push_subscriptions", "businesses"
  add_foreign_key "quick_add_items", "businesses"
  add_foreign_key "quick_add_items", "products"
  add_foreign_key "receipt_events", "businesses"
  add_foreign_key "receipt_events", "orders"
  add_foreign_key "recipe_lines", "businesses"
  add_foreign_key "recipe_lines", "recipes"
  add_foreign_key "recipe_lines", "stock_items"
  add_foreign_key "recipe_lines", "units"
  add_foreign_key "recipes", "businesses"
  add_foreign_key "recipes", "product_variants", column: "variant_id"
  add_foreign_key "recipes", "products"
  add_foreign_key "recipes", "stock_items", column: "output_stock_item_id"
  add_foreign_key "recipes", "stock_sections", column: "source_section_id"
  add_foreign_key "recipes", "units", column: "yield_unit_id"
  add_foreign_key "refresh_tokens", "devices"
  add_foreign_key "refresh_tokens", "memberships"
  add_foreign_key "refresh_tokens", "users"
  add_foreign_key "refunds", "businesses"
  add_foreign_key "refunds", "orders"
  add_foreign_key "refunds", "payment_accounts"
  add_foreign_key "refunds", "payment_methods"
  add_foreign_key "refunds", "shifts"
  add_foreign_key "regular_discount_tiers", "businesses"
  add_foreign_key "report_schedules", "branches"
  add_foreign_key "report_schedules", "businesses"
  add_foreign_key "reservations", "branches"
  add_foreign_key "reservations", "businesses"
  add_foreign_key "reservations", "customers"
  add_foreign_key "reservations", "dining_tables", column: "table_id"
  add_foreign_key "reviews", "businesses"
  add_foreign_key "rider_cash_movements", "businesses"
  add_foreign_key "rider_cash_movements", "riders"
  add_foreign_key "rider_settlements", "businesses"
  add_foreign_key "rider_settlements", "riders"
  add_foreign_key "riders", "branches"
  add_foreign_key "riders", "businesses"
  add_foreign_key "riders", "memberships"
  add_foreign_key "role_permissions", "businesses"
  add_foreign_key "role_permissions", "roles"
  add_foreign_key "roles", "businesses"
  add_foreign_key "safety_net_runs", "businesses"
  add_foreign_key "salary_components", "businesses"
  add_foreign_key "settings", "businesses"
  add_foreign_key "setup_checklist_items", "businesses"
  add_foreign_key "shifts", "branches"
  add_foreign_key "shifts", "businesses"
  add_foreign_key "solid_queue_batch_executions", "solid_queue_batches", column: "batch_id", on_delete: :cascade
  add_foreign_key "solid_queue_batch_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "stations", "branches"
  add_foreign_key "stations", "businesses"
  add_foreign_key "stock_document_lines", "businesses"
  add_foreign_key "stock_document_lines", "stock_documents"
  add_foreign_key "stock_document_lines", "stock_items"
  add_foreign_key "stock_document_lines", "units"
  add_foreign_key "stock_documents", "branches"
  add_foreign_key "stock_documents", "businesses"
  add_foreign_key "stock_documents", "suppliers"
  add_foreign_key "stock_items", "businesses"
  add_foreign_key "stock_items", "units", column: "base_unit_id"
  add_foreign_key "stock_items", "units", column: "purchase_unit_id"
  add_foreign_key "stock_ledger_entries", "branches"
  add_foreign_key "stock_ledger_entries", "businesses"
  add_foreign_key "stock_ledger_entries", "stock_items"
  add_foreign_key "stock_ledger_entries", "stock_sections"
  add_foreign_key "stock_levels", "businesses"
  add_foreign_key "stock_levels", "stock_items"
  add_foreign_key "stock_levels", "stock_sections"
  add_foreign_key "stock_sections", "branches"
  add_foreign_key "stock_sections", "businesses"
  add_foreign_key "subscriptions", "businesses"
  add_foreign_key "subscriptions", "plans"
  add_foreign_key "supplier_adjustments", "businesses"
  add_foreign_key "supplier_payments", "branches"
  add_foreign_key "supplier_payments", "businesses"
  add_foreign_key "supplier_payments", "goods_receipts"
  add_foreign_key "supplier_payments", "suppliers"
  add_foreign_key "supplier_price_history", "businesses"
  add_foreign_key "supplier_price_history", "goods_receipts"
  add_foreign_key "supplier_price_history", "stock_items"
  add_foreign_key "supplier_price_history", "suppliers"
  add_foreign_key "supplier_price_history", "units"
  add_foreign_key "suppliers", "businesses"
  add_foreign_key "support_requests", "businesses"
  add_foreign_key "support_sessions", "businesses"
  add_foreign_key "sync_batches", "businesses"
  add_foreign_key "sync_rejections", "businesses"
  add_foreign_key "table_requests", "branches"
  add_foreign_key "table_requests", "businesses"
  add_foreign_key "table_requests", "dining_tables", column: "table_id"
  add_foreign_key "tax_invoices", "branches"
  add_foreign_key "tax_invoices", "businesses"
  add_foreign_key "tax_invoices", "orders"
  add_foreign_key "tax_rates", "businesses"
  add_foreign_key "unit_conversions", "businesses"
  add_foreign_key "units", "businesses"
  add_foreign_key "user_permissions", "businesses"
  add_foreign_key "user_permissions", "memberships"
  add_foreign_key "voids", "businesses"
  add_foreign_key "voids", "orders"
  add_foreign_key "voucher_batches", "businesses"
  add_foreign_key "vouchers", "businesses"
  add_foreign_key "wage_payments", "businesses"
  add_foreign_key "wage_payments", "employees"
  add_foreign_key "website_configs", "businesses"
end
