# SPEC: staff populations are separate record types (Admin Staff, Cashiers with Cashier, Supervisor or Kitchen Display
# roles, Order Takers); the business day is a start-and-end window, default 6:01 am to 2:01 am.
class AddStaffTypesAndBusinessDayWindow < ActiveRecord::Migration[8.0]
  def up
    add_column :memberships, :staff_type, :string
    add_column :memberships, :cashier_role, :string
    add_check_constraint :memberships, "staff_type IN ('admin', 'cashier', 'order_taker', 'rider')", name: "memberships_staff_type_check"
    add_check_constraint :memberships, "cashier_role IS NULL OR cashier_role IN ('cashier', 'supervisor', 'kitchen_display')", name: "memberships_cashier_role_check"
    add_index :memberships, [:business_id, :staff_type]

    # Existing members get the type their role suggests.
    execute <<~SQL
      UPDATE memberships m SET staff_type = CASE r.system_key
          WHEN 'cashier' THEN 'cashier' WHEN 'kitchen' THEN 'cashier' WHEN 'waiter' THEN 'order_taker' WHEN 'rider' THEN 'rider' ELSE 'admin' END,
        cashier_role = CASE r.system_key WHEN 'cashier' THEN 'cashier' WHEN 'kitchen' THEN 'kitchen_display' ELSE NULL END
      FROM roles r WHERE r.id = m.role_id
    SQL
    change_column_null :memberships, :staff_type, false

    add_column :branches, :business_day_start, :time, null: false, default: "06:01"
    change_column_default :branches, :day_end_time, from: "04:00", to: "02:01"
  end

  def down
    change_column_default :branches, :day_end_time, from: "02:01", to: "04:00"
    remove_column :branches, :business_day_start
    remove_index :memberships, [:business_id, :staff_type]
    remove_check_constraint :memberships, name: "memberships_cashier_role_check"
    remove_check_constraint :memberships, name: "memberships_staff_type_check"
    remove_column :memberships, :cashier_role
    remove_column :memberships, :staff_type
  end
end
