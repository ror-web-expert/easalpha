# Daily and weekly wages beside the monthly salary: an employee's pay frequency decides whether the monthly payroll
# run prices them or they are paid per day or week as a wage payment. Asked for on 12 Oct 2026.
class WagePayments < ActiveRecord::Migration[8.0]
  def up
    add_column :employees, :whatsapp_notify, :boolean, null: false, default: true
    add_check_constraint :employees, "pay_frequency IN ('monthly','weekly','daily')", name: "employees_pay_frequency_check"

    create_table :wage_payments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.date :period_from, null: false
      t.date :period_to, null: false
      t.decimal :days_worked, precision: 6, scale: 2, null: false, default: 0
      t.bigint :rate_minor, null: false, default: 0
      t.bigint :gross_minor, null: false, default: 0
      t.bigint :bonus_minor, null: false, default: 0
      t.bigint :deductions_minor, null: false, default: 0
      t.bigint :advance_recovered_minor, null: false, default: 0
      t.bigint :net_minor, null: false, default: 0
      t.string :method_code
      t.uuid :payment_account_id
      t.uuid :expense_id
      t.uuid :shift_id
      t.text :note
      t.string :status, null: false, default: "paid"
      t.text :void_reason
      t.datetime :voided_at
      t.uuid :by_membership_id
      t.datetime :paid_at
      t.timestamps
    end
    add_index :wage_payments, %i[business_id number], unique: true
    add_index :wage_payments, %i[employee_id period_from period_to], unique: true, where: "status = 'paid'", name: "index_wage_payments_one_paid_per_period"
    add_check_constraint :wage_payments, "status IN ('paid','voided')", name: "wage_payments_status_check"
    add_check_constraint :wage_payments, "period_to >= period_from", name: "wage_payments_period_check"
    EasAlpha::Rls.apply!(%w[wage_payments])
  end

  def down
    drop_table :wage_payments
    remove_check_constraint :employees, name: "employees_pay_frequency_check"
    remove_column :employees, :whatsapp_notify
  end
end
