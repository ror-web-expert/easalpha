require "rails_helper"
require "rake"

# The finance:* rake tasks correct money recorded before the journal covered it: khata refunds (deploy#5), supplier
# openings (QA B10) and the canteen's internal methods that sat under Cash at Bank (QA B4). Dry run by default, each
# voucher on the day of its record, and a second run posts nothing.
RSpec.describe Finance::Backfill, type: :request do
  let!(:owner) { signup_business(name: "Steel Works Mess") }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.order(:created_at).first } }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def balance(code) = within(biz) { Finance::Statements.balances(as_of: today)[GlAccount.find_by!(code: code).id] }
  def lines(entry) = entry.lines.map { |l| [ l.gl_account.code, l.debit_minor, l.credit_minor ] }
  def forget_vouchers!(ref) = within(biz) { JournalEntry.where(ref_table: ref.class.table_name, ref_id: ref.id).find_each { |e| JournalLine.where(journal_entry_id: e.id).delete_all && e.delete } }

  def rake!(task, dry_run: true)
    Rails.application.load_tasks unless Rake::Task.task_defined?("finance:backfill_khata_refunds")
    ENV["DRY_RUN"] = "0" unless dry_run
    Rake::Task[task].reenable
    Rake::Task[task].invoke
  ensure
    ENV.delete("DRY_RUN")
  end

  def khata_sale_refunded!(refund_minor:)
    api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567" }, headers: headers
    cust = json[:id]
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: refund_minor, method_code: "khata", reason: "Short pour" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    refund = within(biz) { Refund.find(json[:refund][:id]) }
    forget_vouchers!(refund) # as the refunder before the khata refund journal left it
    [ o, refund ]
  end

  describe "khata refunds (deploy#5)" do
    it "shows what it would post on a dry run, then posts each on its own day once" do
      o, refund = khata_sale_refunded!(refund_minor: 2_000)
      expect(balance("1100")).to eq(9_280) # the customer owes Rs 72.80, the books say Rs 92.80
      rows = within(biz) { described_class.khata_refunds!(dry_run: true) }
      expect(rows.size).to eq(1)
      expect(rows.first[:text]).to include(o[:label], "Rs 20.00")
      expect(rows.first[:lines]).to include(a_string_starting_with("1100 Accounts Receivable: Dr Rs 0.00 Cr Rs 20.00"))
      within(biz) { expect(JournalEntry.where(ref_table: "refunds")).to be_empty }

      within(biz) { described_class.khata_refunds!(dry_run: false) }
      within(biz) do
        e = JournalEntry.find_by!(ref_table: "refunds", ref_id: refund.id)
        expect(e.business_day).to eq(refund.business_day)
        expect(lines(e)).to contain_exactly([ "4000", 1_724, 0 ], [ "2100", 276, 0 ], [ "1100", 0, 2_000 ])
        expect(balance("1100")).to eq(Customer.find(Order.find(o[:id]).customer_id).balance_minor)
      end
      expect(within(biz) { described_class.khata_refunds!(dry_run: false) }).to be_empty
    end

    it "takes a refund of a sale journaled whole to Sales out of Sales" do
      o, = khata_sale_refunded!(refund_minor: 2_000)
      within(biz) do
        p = Payment.find_by!(order_id: o[:id])
        forget_vouchers!(p)
        Finance::Journal.post!(business_day: p.business_day, ref: p, description: "Order on account before the split", lines: [ { account: "1100", debit_minor: 9_280 }, { account: "4000", credit_minor: 9_280 } ])
        described_class.khata_refunds!(dry_run: false)
      end
      expect(balance("4000")).to eq(7_280)
      expect(balance("2100")).to eq(0)
      expect(balance("1100")).to eq(7_280)
    end

    it "runs from rake: a dry run unless DRY_RUN=0, then once" do
      khata_sale_refunded!(refund_minor: 9_280)
      expect { rake!("finance:backfill_khata_refunds") }.to output(/Steel Works Mess .*1 khata refund\(s\) \(dry run, nothing written\)/).to_stdout
      within(biz) { expect(JournalEntry.where(ref_table: "refunds")).to be_empty }
      expect { rake!("finance:backfill_khata_refunds", dry_run: false) }.to output(/1 khata refund\(s\)\n/).to_stdout
      within(biz) { expect(JournalEntry.where(ref_table: "refunds").count).to eq(1) }
      %w[1100 4000 2100].each { |code| expect(balance(code)).to eq(0) }
      expect { rake!("finance:backfill_khata_refunds", dry_run: false) }.not_to output.to_stdout
    end
  end

  describe "supplier openings (B10)" do
    it "posts the openings entered before they were journaled, on the day the supplier was added" do
      api_post "/api/v1/suppliers", { name: "Dawn Bread", opening_balance_minor: 500_000 }, headers: headers
      sup = within(biz) { Supplier.find(json[:id]) }
      forget_vouchers!(sup)
      expect(balance("2010")).to eq(0)
      expect(within(biz) { described_class.supplier_openings!(dry_run: true) }.sole[:text]).to include("Dawn Bread", "Rs 5000.00")
      expect(balance("2010")).to eq(0)
      within(biz) { described_class.supplier_openings!(dry_run: false) }
      expect(balance("2010")).to eq(500_000)
      expect(balance("3010")).to eq(-500_000)
      within(biz) { expect(JournalEntry.find_by!(ref_table: "suppliers", ref_id: sup.id).business_day).to eq(branch.business_day_for(sup.created_at)) }
      expect(within(biz) { described_class.supplier_openings!(dry_run: false) }).to be_empty
    end
  end

  describe "internal methods (B4)" do
    # The canteen's methods as an older build left them: a "custom" account under Cash at Bank, a meal's company share
    # and a salary deduction posted to it with the old journal (voucher on the account entry, the meal to Sales).
    def legacy_internal!(code, name, amount)
      within(biz) do
        method = Canteen::Claims.internal_method!(code, name)
        pa = PaymentAccount.create!(name: name, kind: "custom")
        method.update_columns(payment_account_id: pa.id)
        mirror = Finance::Chart.for_payment_account(pa)
        record = if code == Canteen::Claims::SUBSIDY_CODE
          order = Orders::Builder.create!({ order_type: "walk_in", source: "kiosk" }, lines: [ { product_id: m[:burger].id } ], actor: owner, device: nil, branch: branch).order
          Payment.create!(order: order, branch_id: branch.id, payment_method: method, method_code: code, amount_minor: amount, business_day: today - 2, received_at: Time.current, payment_account: pa)
        else
          cust = Customer.create!(name: "Akbar Ali")
          CustomerPayment.create!(customer: cust, branch_id: branch.id, direction: "received", amount_minor: amount, payment_method: method, payment_account: pa, business_day: today - 1, received_at: Time.current)
        end
        entry = pa.post!(kind: record.is_a?(Payment) ? "order_payment" : "customer_payment", amount_minor: amount, business_day: record.business_day, ref: record, skip_journal: true)
        Finance::Journal.post!(business_day: record.business_day, ref: entry, lines: [ { account: mirror, debit_minor: amount }, { account: record.is_a?(Payment) ? "4000" : "1100", credit_minor: amount } ])
        pa
      end
    end

    it "moves each day's balance to Staff Meals or Salaries, closes the accounts and leaves nothing in Cash at Bank" do
      subsidy = legacy_internal!("canteen_subsidy", "Company subsidy", 32_200)
      deduction = legacy_internal!("canteen_payroll", "Salary deduction", 20_000)
      get "/api/v1/finance/dashboard", headers: headers
      expect(json[:total_balance_minor]).to eq(52_200)

      rows = within(biz) { described_class.internal_methods!(dry_run: true) }
      expect(rows.map { |r| r[:text] }).to include(a_string_including("Company subsidy #{today - 2} Rs 322.00"), a_string_including("Salary deduction #{today - 1} Rs 200.00"))
      within(biz) { expect(subsidy.reload).to have_attributes(active: true, current_balance_minor: 32_200) }

      within(biz) { described_class.internal_methods!(dry_run: false) }
      expect(balance("5170")).to eq(32_200)
      expect(balance("5110")).to eq(20_000)
      within(biz) do
        [ subsidy, deduction ].each do |pa|
          expect(pa.reload).to have_attributes(active: false, current_balance_minor: 0)
          expect(pa.archived_at).to be_present
          expect(Finance::Statements.balances(as_of: today)[GlAccount.find_by!(payment_account_id: pa.id).id]).to eq(0)
        end
        expect(PaymentMethod.where(internal: true).pluck(:payment_account_id)).to all(be_nil)
        expect(JournalEntry.where(ref_table: "payment_accounts", ref_id: subsidy.id).sole.business_day).to eq(today - 2)
      end
      get "/api/v1/finance/dashboard", headers: headers
      expect(json[:total_balance_minor]).to eq(0)
      get "/api/v1/finance/trial_balance?from=#{today - 5}&to=#{today}", headers: headers
      expect(json[:balanced]).to be true
      expect(within(biz) { described_class.internal_methods!(dry_run: false) }).to be_empty
    end

    it "leaves an account alone that also holds other money" do
      pa = legacy_internal!("canteen_subsidy", "Company subsidy", 32_200)
      within(biz) { pa.post!(kind: "deposit", amount_minor: 1_000, business_day: today, description: "Owner") }
      rows = within(biz) { described_class.internal_methods!(dry_run: false) }
      expect(rows.sole[:text]).to include("left as it is (it holds other entries)")
      within(biz) { expect(pa.reload).to have_attributes(active: true, current_balance_minor: 33_200) }
      expect(balance("5170")).to eq(0)
    end
  end
end
