# Customer accounts (khata) for hostels, canteens and offices: student details on the customer, an opening balance and
# balance adjustments as insert-only ledger rows (a mistake is reversed, never edited), and bill runs that record each
# month-end send. Asked for on 12 Oct 2026.
class CustomerAccounts < ActiveRecord::Migration[8.0]
  def up
    change_table :customers, bulk: true do |t|
      t.string :room
      t.string :member_no
      t.string :guardian_name
      t.string :guardian_phone
      t.boolean :notify_guardian, null: false, default: false
    end
    add_index :customers, %i[business_id member_no], where: "member_no IS NOT NULL AND archived_at IS NULL"
    add_index :customers, %i[business_id guardian_phone], where: "guardian_phone IS NOT NULL"

    create_table :customer_adjustments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.references :customer, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :kind, null: false
      t.bigint :amount_minor, null: false
      t.text :reason, null: false
      t.date :effective_on, null: false
      t.date :business_day, null: false
      t.uuid :by_membership_id
      t.uuid :approved_by_membership_id
      t.uuid :reverses_id
      t.timestamps
    end
    add_index :customer_adjustments, %i[business_id number], unique: true
    add_index :customer_adjustments, :reverses_id, unique: true, where: "reverses_id IS NOT NULL"
    add_foreign_key :customer_adjustments, :customer_adjustments, column: :reverses_id
    add_check_constraint :customer_adjustments, "kind IN ('opening','adjustment','reversal')", name: "customer_adjustments_kind_check"
    add_check_constraint :customer_adjustments, "amount_minor <> 0", name: "customer_adjustments_amount_check"

    create_table :bill_runs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.date :period_from, null: false
      t.date :period_to, null: false
      t.date :due_on
      t.string :trigger, null: false, default: "manual"
      t.string :status, null: false, default: "running"
      t.integer :customers_count, null: false, default: 0
      t.integer :sent_count, null: false, default: 0
      t.integer :failed_count, null: false, default: 0
      t.integer :skipped_count, null: false, default: 0
      t.jsonb :results, null: false, default: []
      t.uuid :by_membership_id
      t.timestamps
    end
    add_index :bill_runs, %i[business_id period_from period_to], unique: true, where: "trigger = 'auto'", name: "index_bill_runs_one_auto_per_period"
    add_check_constraint :bill_runs, "trigger IN ('auto','manual')", name: "bill_runs_trigger_check"
    add_check_constraint :bill_runs, "status IN ('running','done')", name: "bill_runs_status_check"

    EasAlpha::Rls.apply!(%w[customer_adjustments bill_runs])
    EasAlpha::Triggers.apply!(connection)
  end

  def down
    drop_table :bill_runs
    drop_table :customer_adjustments
    remove_index :customers, %i[business_id guardian_phone]
    remove_index :customers, %i[business_id member_no]
    change_table :customers, bulk: true do |t|
      t.remove :room, :member_no, :guardian_name, :guardian_phone, :notify_guardian
    end
  end
end
