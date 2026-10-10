class CreatePayroll < ActiveRecord::Migration[8.0]
  def up
    create_table :departments, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.datetime :archived_at
      t.timestamps
    end
    add_index :departments, [:business_id, :name], unique: true, where: "archived_at is null"

    create_table :employees, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.references :membership, type: :uuid, foreign_key: true
      t.references :department, type: :uuid, foreign_key: true
      t.string :name, null: false
      t.string :phone
      t.string :cnic
      t.string :designation
      t.bigint :base_salary_minor, null: false, default: 0
      t.string :pay_frequency, null: false, default: "monthly"
      t.date :joined_on
      t.date :left_on
      t.boolean :fingerprint_enrolled, null: false, default: false
      t.boolean :shares_tips, null: false, default: false
      t.text :notes
      t.datetime :archived_at
      t.timestamps
    end
    add_index :employees, [:business_id, :membership_id], unique: true, where: "membership_id is not null"

    create_table :salary_components, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false
      t.bigint :default_amount_minor, null: false, default: 0
      t.boolean :is_percent, null: false, default: false
      t.decimal :percent, precision: 6, scale: 2
      t.datetime :archived_at
      t.timestamps
    end
    add_check_constraint :salary_components, "kind in ('earning','deduction')", name: "salary_components_kind_check"

    create_table :employee_salary_components, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.references :salary_component, type: :uuid, null: false, foreign_key: true
      t.bigint :amount_minor
      t.decimal :percent, precision: 6, scale: 2
      t.timestamps
    end
    add_index :employee_salary_components, [:employee_id, :salary_component_id], unique: true, name: "idx_employee_components_unique"

    create_table :attendance_rules, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, foreign_key: true
      t.time :shift_start, null: false, default: "10:00"
      t.time :shift_end, null: false, default: "22:00"
      t.integer :grace_minutes, null: false, default: 15
      t.bigint :late_fine_minor, null: false, default: 0
      t.integer :late_fine_after_minutes, null: false, default: 30
      t.string :absent_rule, null: false, default: "calendar_days"
      t.integer :working_days, array: true, null: false, default: [1, 2, 3, 4, 5, 6]
      t.boolean :require_fingerprint_to_close_shift, null: false, default: false
      t.timestamps
    end
    add_index :attendance_rules, [:business_id, :employee_id], unique: true, name: "idx_attendance_rules_unique", where: "employee_id is not null"
    add_check_constraint :attendance_rules, "absent_rule in ('calendar_days','fixed_26')", name: "attendance_rules_absent_check"

    create_table :attendances, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.date :business_day, null: false
      t.datetime :checked_in_at
      t.datetime :checked_out_at
      t.string :source, null: false, default: "manual"
      t.integer :late_minutes, null: false, default: 0
      t.integer :worked_minutes, null: false, default: 0
      t.bigint :fine_minor, null: false, default: 0
      t.string :status, null: false, default: "present"
      t.string :selfie_key
      t.text :note
      t.uuid :marked_by_membership_id
      t.timestamps
    end
    add_index :attendances, [:employee_id, :business_day], unique: true
    add_check_constraint :attendances, "source in ('fingerprint','selfie','manual','pin')", name: "attendances_source_check"
    add_check_constraint :attendances, "status in ('present','absent','leave','holiday','half_day')", name: "attendances_status_check"

    create_table :leave_requests, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.string :kind, null: false
      t.date :from_date, null: false
      t.date :to_date, null: false
      t.text :reason
      t.string :status, null: false, default: "pending"
      t.uuid :approved_by_membership_id
      t.datetime :decided_at
      t.timestamps
    end
    add_check_constraint :leave_requests, "kind in ('paid','unpaid','sick')", name: "leave_requests_kind_check"
    add_check_constraint :leave_requests, "status in ('pending','approved','rejected')", name: "leave_requests_status_check"

    create_table :holidays, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.string :name, null: false
      t.date :on_date, null: false
      t.boolean :paid, null: false, default: true
      t.timestamps
    end
    add_index :holidays, [:business_id, :on_date, :branch_id], unique: true

    create_table :advances, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.integer :number, null: false
      t.bigint :amount_minor, null: false
      t.bigint :outstanding_minor, null: false, default: 0
      t.bigint :installment_minor
      t.string :reason
      t.string :status, null: false, default: "pending"
      t.date :requested_on, null: false
      t.uuid :approved_by_membership_id
      t.uuid :payment_account_id
      t.uuid :expense_id
      t.datetime :paid_at
      t.timestamps
    end
    add_index :advances, [:business_id, :number], unique: true
    add_check_constraint :advances, "status in ('pending','approved','rejected','paid','repaid')", name: "advances_status_check"

    create_table :payroll_runs, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, foreign_key: true
      t.date :month, null: false
      t.string :status, null: false, default: "generated"
      t.text :notes
      t.integer :employees_count, null: false, default: 0
      t.bigint :gross_minor, null: false, default: 0
      t.bigint :deductions_minor, null: false, default: 0
      t.bigint :net_minor, null: false, default: 0
      t.uuid :generated_by_membership_id
      t.uuid :paid_by_membership_id
      t.uuid :payment_account_id
      t.datetime :paid_at
      t.timestamps
    end
    add_index :payroll_runs, [:business_id, :branch_id, :month], unique: true
    add_check_constraint :payroll_runs, "status in ('generated','approved','paid','cancelled')", name: "payroll_runs_status_check"

    create_table :payslips, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :payroll_run, type: :uuid, null: false, foreign_key: true
      t.references :employee, type: :uuid, null: false, foreign_key: true
      t.bigint :base_minor, null: false, default: 0
      t.bigint :earnings_minor, null: false, default: 0
      t.bigint :deductions_minor, null: false, default: 0
      t.bigint :absence_minor, null: false, default: 0
      t.bigint :late_fines_minor, null: false, default: 0
      t.bigint :advances_recovered_minor, null: false, default: 0
      t.bigint :tips_minor, null: false, default: 0
      t.bigint :commission_minor, null: false, default: 0
      t.bigint :net_minor, null: false, default: 0
      t.integer :days_present, null: false, default: 0
      t.integer :days_absent, null: false, default: 0
      t.integer :days_leave, null: false, default: 0
      t.jsonb :detail, null: false, default: {}
      t.datetime :paid_at
      t.uuid :payment_account_id
      t.uuid :expense_id
      t.timestamps
    end
    add_index :payslips, [:payroll_run_id, :employee_id], unique: true

    Servio::Rls.apply!(%w[departments employees salary_components employee_salary_components attendance_rules attendances leave_requests holidays advances payroll_runs payslips])
  end

  def down
    %i[payslips payroll_runs advances holidays leave_requests attendances attendance_rules employee_salary_components salary_components employees departments].each { |t| drop_table t }
  end
end
