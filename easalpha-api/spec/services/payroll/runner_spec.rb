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

  # R20: the unique index on business, branch and month counted cancelled runs, so a cancelled branch run could never
  # be generated again (409 "A record with this id already exists"). A live run still holds its branch and month.
  it "generates a branch run again once the first one was cancelled" do
    sana = employee!("Sana", branch_id: branch.id)
    api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m"), branch_id: branch.id }, headers: headers
    expect(response).to have_http_status(:created), response.body
    first_id = json[:id]
    api_post "/api/v1/payroll/runs/#{first_id}/cancel", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m"), branch_id: branch.id }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:payslips].map { |p| p[:employee_id] }).to eq([ sana.id ])
    within(biz) do
      expect(PayrollRun.where(branch_id: branch.id, month: month).pluck(:status)).to contain_exactly("cancelled", "generated")
      expect { PayrollRun.create!(branch: branch, month: month) }.to raise_error(ActiveRecord::RecordNotUnique)
    end
    # Someone who joined the branch since is not added to the live run: the answer says what to do instead.
    employee!("Bilal", branch_id: branch.id)
    api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m"), branch_id: branch.id }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error]).to include(code: "payroll.exists", message: "Payroll for September 2026 already exists for #{branch.name}; cancel it and generate it again to include the employee added since")
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

    # Every session is open all day, so a second session gives a worker a second meal today.
    def claim!(e, session: "Lunch")
      within(biz) do
        s = MealSession.find_by(name: session) || MealSession.create!(branch: branch, name: session, starts_at: "00:00", ends_at: "23:59")
        plan = Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: s, date: today_for(biz), items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ]))
        Canteen::Claims.claim!(branch: branch, actor: owner, employee_id: e.id, meal_plan_item_id: plan.items.first.id, meal_session_id: s.id)
      end
    end

    def balance(worker) = within(biz) { Customer.find(Employee.find(worker.id).customer_id).balance_minor }
    def canteen_line(slip) = slip.detail["components"].find { |c| c["canteen"] }

    # R21: a meal taken after its month's run was generated stayed on the worker's account for good: the run had not
    # seen it and the next month's run looked at the next month only. The next run now takes it, once.
    it "takes a meal claimed after the month's run was generated on the next run, and only once" do
      worker = employee!("Akbar")
      claim!(worker)
      run = generate!
      late = claim!(worker, session: "Dinner")
      within(biz) do
        slip = run.payslips.find_by(employee_id: worker.id)
        expect(slip.deductions_minor).to eq(20_000)
        described_class.pay!(run, actor: owner, branch: branch)
        expect(slip.reload.deductions_minor).to eq(20_000) # the late meal is not this payslip's
      end
      expect(balance(worker)).to eq(20_000)

      following = within(biz) { described_class.generate!(month: month.next_month, actor: owner) }
      within(biz) do
        slip = following.payslips.find_by(employee_id: worker.id)
        expect(slip.deductions_minor).to eq(20_000)
        expect(slip.detail["canteen"]).to eq("claim_ids" => [ late.id ], "carried" => 1)
        expect(canteen_line(slip)["name"]).to eq("Canteen meals (1, 1 from earlier months)")
        described_class.pay!(following, actor: owner, branch: branch)
      end
      expect(balance(worker)).to eq(0)

      third = within(biz) { described_class.generate!(month: month.next_month(2), actor: owner) }
      within(biz) { expect(third.payslips.find_by(employee_id: worker.id)).to have_attributes(deductions_minor: 0, detail: include("canteen" => { "claim_ids" => [], "carried" => 0 })) }
    end

    it "leaves a late meal to a cancelled run's replacement, and takes it on the next run while the first is still unpaid" do
      worker = employee!("Akbar")
      first = claim!(worker)
      run = generate!
      late = claim!(worker, session: "Dinner")
      following = within(biz) { described_class.generate!(month: month.next_month, actor: owner) }
      within(biz) do
        expect(following.payslips.find_by(employee_id: worker.id).detail["canteen"]["claim_ids"]).to eq([ late.id ]) # the first run still holds its own
        following.update!(status: "cancelled")
        run.update!(status: "cancelled")
      end
      again = generate! # the month again: both of its meals, since no live run holds either
      within(biz) { expect(again.payslips.find_by(employee_id: worker.id).detail["canteen"]["claim_ids"]).to contain_exactly(first.id, late.id) }
    end

    it "never sweeps up meals of a month whose run took no canteen deduction" do
      worker = employee!("Akbar")
      api_patch "/api/v1/settings", { values: { "canteen.payroll_deduction" => false } }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      claim!(worker) # paid at the counter, not from the salary
      run = generate!
      within(biz) { expect(run.payslips.find_by(employee_id: worker.id).detail).not_to have_key("canteen") }
      api_patch "/api/v1/settings", { values: { "canteen.payroll_deduction" => true } }, headers: headers
      following = within(biz) { described_class.generate!(month: month.next_month, actor: owner) }
      within(biz) { expect(following.payslips.find_by(employee_id: worker.id).deductions_minor).to eq(0) }
    end

    # Payslips generated before the claim ids were kept carry a canteen line only: what it covered is the month's
    # claims that existed when it was generated.
    it "reads a payslip from before claim ids were kept as covering the meals that existed when it was generated" do
      worker = employee!("Akbar")
      claim!(worker)
      run = generate!
      within(biz) do
        slip = run.payslips.find_by(employee_id: worker.id)
        slip.update_columns(detail: slip.detail.except("canteen"))
      end
      late = claim!(worker, session: "Dinner")
      following = within(biz) { described_class.generate!(month: month.next_month, actor: owner) }
      within(biz) { expect(following.payslips.find_by(employee_id: worker.id).detail["canteen"]["claim_ids"]).to eq([ late.id ]) }
      within(biz) do
        described_class.pay!(run, actor: owner, branch: branch) # the old payslip still settles from the month's live claims, capped at what it reserved
        expect(run.payslips.find_by(employee_id: worker.id).deductions_minor).to eq(20_000)
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
