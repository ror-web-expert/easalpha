class CreateShifts < ActiveRecord::Migration[8.0]
  def up
    create_table :shifts, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.uuid :device_id
      t.uuid :cashier_membership_id, null: false
      t.uuid :drawer_account_id
      t.date :business_day, null: false
      t.datetime :opened_at, null: false
      t.bigint :opening_cash_minor, null: false, default: 0
      t.datetime :closed_at
      t.bigint :expected_cash_minor
      t.bigint :counted_cash_minor
      t.bigint :over_short_minor
      t.jsonb :count_detail, null: false, default: {}
      t.uuid :approved_by_membership_id
      t.string :status, null: false, default: "open"
      t.string :settlement_status, null: false, default: "pending"
      t.jsonb :z_report, null: false, default: {}
      t.text :close_note
      t.datetime :client_created_at
      t.timestamps
    end
    add_index :shifts, [ :business_id, :branch_id, :business_day ]
    add_index :shifts, [ :cashier_membership_id ], unique: true, where: "status = 'open'", name: "idx_shifts_one_open_per_cashier"
    add_check_constraint :shifts, "status in ('open','closed','force_closed')", name: "shifts_status_check"
    add_check_constraint :shifts, "settlement_status in ('pending','settled')", name: "shifts_settlement_check"

    create_table :cash_movements, id: :uuid, default: nil do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :shift, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.bigint :amount_minor, null: false
      t.string :reason, null: false
      t.string :reference
      t.uuid :by_membership_id
      t.uuid :approved_by_membership_id
      t.uuid :account_entry_id
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_check_constraint :cash_movements, "kind in ('cash_in','cash_out','payout','float_issue','float_return','drop')", name: "cash_movements_kind_check"

    create_table :day_closes, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.date :business_day, null: false
      t.datetime :locked_at
      t.uuid :locked_by_membership_id
      t.datetime :reopened_at
      t.uuid :reopened_by_membership_id
      t.string :reopen_reason
      t.jsonb :summary, null: false, default: {}
      t.timestamps
    end
    add_index :day_closes, [ :branch_id, :business_day ], unique: true

    add_foreign_key :orders, :shifts, column: :shift_id
    add_foreign_key :payments, :shifts, column: :shift_id
    add_foreign_key :refunds, :shifts, column: :shift_id

    EasAlpha::Rls.apply!(%w[shifts cash_movements day_closes])
  end

  def down
    remove_foreign_key :refunds, :shifts
    remove_foreign_key :payments, :shifts
    remove_foreign_key :orders, :shifts
    drop_table :day_closes, :cash_movements, :shifts
  end
end
