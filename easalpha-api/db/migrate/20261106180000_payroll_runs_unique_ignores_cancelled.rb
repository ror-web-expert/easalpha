# One payroll run per business, branch and month still holds, but a cancelled run no longer counts: the index used to
# include it, so a cancelled branch run could never be generated again (6 Nov 2026 review, R20).
class PayrollRunsUniqueIgnoresCancelled < ActiveRecord::Migration[8.1]
  def change
    remove_index :payroll_runs, %i[business_id branch_id month], unique: true, name: "index_payroll_runs_on_business_id_and_branch_id_and_month"
    add_index :payroll_runs, %i[business_id branch_id month], unique: true, where: "status <> 'cancelled'", name: "index_payroll_runs_one_live_per_branch_month"
  end
end
