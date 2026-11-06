require "rails_helper"

# Payroll::Runner after the 6 Nov review (item 11): one payslip per employee and month whatever the run's branch, an
# advance reserved at generate and consumed at pay (released when the run is cancelled), tips shared within the run's
# branch, and the canteen bill settled from the live claims whatever the net.
RSpec.describe Payroll::Runner, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.order(:created_at).first } } # the main branch, whatever a second one's uuid sorts as
  let(:headers) { auth_headers(owner) }
  let(:month) { Date.new(2026, 9, 1) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  # Present every day of the month, so the whole base salary is earned.
  def employee!(name, salary: 5_000_000, branch_id: nil, shares_tips: false)
    within(biz) do
      e = Employee.create!(name: name, base_salary_minor: salary, pay_frequency: "monthly", joined_on: Date.new(2026, 1, 1), branch_id: branch_id, shares_tips: shares_tips)
      (month..month.end_of_month).each { |d| Attendance.create!(employee_id: e.id, business_day: d, status: "present", source: "manual") }
      e
    end
  end

  def advance!(e, amount, installment: nil)
    within(biz) do
      a = Payroll::Advances.request!(e, amount_minor: amount, reason: "Medical", by: owner, installment_minor: installment)
      Payroll::Advances.decide!(a, approve: true, by: owner)
      Payroll::Advances.pay!(a, actor: owner, branch: branch)
    end
  end

  def generate!(run_branch = nil) = within(biz) { described_class.generate!(month: month, actor: owner, branch: run_branch) }

  it "refuses a second run for the same people whatever the branch, and leaves out those already on a run" do
    sana = employee!("Sana")
    advance!(sana, 300_000, installment: 100_000)
    run = generate!
    within(biz) do
      expect(run.payslips.find_by(employee_id: sana.id).advances_recovered_minor).to eq(100_000)
      expect(Advance.find_by(employee_id: sana.id).outstanding_minor).to eq(300_000) # reserved, not yet taken
      expect(described_class.reserved_advances(sana)).to eq("ADV-1" => 100_000)
      expect { described_class.generate!(month: month, actor: owner, branch: branch) }.to raise_error(Api::Errors::Conflict, /already exists/)
    end
    bilal = employee!("Bilal", branch_id: branch.id)
    second = generate!(branch)
    within(biz) { expect(second.payslips.pluck(:employee_id)).to eq([ bilal.id ]) }
  end

  it "releases the reservation when a run is cancelled, consumes it at pay, and never takes more than is outstanding" do
    sana = employee!("Sana")
    advance!(sana, 300_000, installment: 100_000)
    first = generate!
    within(biz) { first.update!(status: "cancelled") }
    second = generate!
    within(biz) do
      slip = second.payslips.find_by(employee_id: sana.id)
      expect(slip.advances_recovered_minor).to eq(100_000)
      Advance.find_by(employee_id: sana.id).update!(outstanding_minor: 60_000) # repaid by hand in the meantime
      described_class.pay!(second, actor: owner, branch: branch)
      expect(Advance.find_by(employee_id: sana.id)).to have_attributes(outstanding_minor: 0, status: "repaid")
      expect(slip.reload.paid_at).to be_present
    end
  end

  it "shares tips within the run's branch only" do
    sana = employee!("Sana", shares_tips: true)
    within(biz) do
      other = Branch.create!(name: "Two")
      Order.create!(branch: branch, order_type: "walk_in", status: "paid", business_day: Date.new(2026, 9, 10), tip_minor: 5_000)
      Order.create!(branch: other, order_type: "walk_in", status: "paid", business_day: Date.new(2026, 9, 11), tip_minor: 7_000)
    end
    all = generate!
    within(biz) do
      expect(all.payslips.find_by(employee_id: sana.id).tips_minor).to eq(12_000)
      all.update!(status: "cancelled")
    end
    mine = generate!(branch)
    within(biz) { expect(mine.payslips.find_by(employee_id: sana.id).tips_minor).to eq(5_000) }
  end

  describe "canteen" do
    let(:m) { build_menu!(biz) }
    let(:month) { today_for(biz).beginning_of_month }

    before do
      api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
      expect(response).to have_http_status(:ok), response.body
    end

    def claim!(e)
      within(biz) do
        lunch = MealSession.find_by(name: "Lunch") || MealSession.create!(branch: branch, name: "Lunch", starts_at: "00:00", ends_at: "23:59")
        plan = Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: lunch, date: today_for(biz), items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ]))
        Canteen::Claims.claim!(branch: branch, actor: owner, employee_id: e.id, meal_plan_item_id: plan.items.first.id)
      end
    end

    it "settles the canteen bill even when the net is zero" do
      worker = employee!("Akbar", salary: 20_000) # the whole salary goes on meals
      claim!(worker)
      run = generate!
      within(biz) do
        slip = run.payslips.find_by(employee_id: worker.id)
        expect(slip).to have_attributes(deductions_minor: 20_000, net_minor: 0)
        described_class.pay!(run, actor: owner, branch: branch)
        customer = Customer.find(Employee.find(worker.id).customer_id)
        expect(customer.balance_minor).to eq(0)
        expect(CustomerPayment.where(customer_id: customer.id).sum(:amount_minor)).to eq(20_000)
        expect(slip.reload.paid_at).to be_present
        expect(Expense.where(source: "payroll_sync").count).to eq(0)
      end
    end

    it "does not take a meal cancelled between generate and pay" do
      worker = employee!("Akbar")
      claim = claim!(worker)
      run = generate!
      within(biz) do
        slip = run.payslips.find_by(employee_id: worker.id)
        expect(slip.deductions_minor).to eq(20_000)
        net_before = slip.net_minor
        Canteen::Claims.cancel!(claim, by: owner, reason: "wrong finger")
        described_class.pay!(run, actor: owner, branch: branch)
        expect(slip.reload).to have_attributes(deductions_minor: 0, net_minor: net_before + 20_000)
        expect(CustomerPayment.where(customer_id: Employee.find(worker.id).customer_id)).to be_empty
        expect(run.reload.net_minor).to eq(slip.net_minor)
      end
    end
  end
end
