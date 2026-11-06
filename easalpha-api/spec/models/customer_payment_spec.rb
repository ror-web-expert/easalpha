require "rails_helper"

# Customer payment numbers come from the business's counter (review of 6 Nov 2026, R25). Before, each payment took
# max + 1 under its own customer's row lock: two customers paying at the same moment read the same max, and the
# business-wide unique index on the number refused the second payment.
RSpec.describe CustomerPayment, type: :model do
  def receive!(biz, customer, actor)
    Payments::Khata.receive!(customer, amount_minor: 1_000, method_code: "cash", actor: actor, branch: within(biz) { Branch.first })
  end

  describe "numbering" do
    let!(:owner) { signup_business }
    let(:biz) { owner.business }

    it "numbers every customer's payments in one sequence, carrying on from the numbers given before the counter" do
      within(biz) do
        PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
        a = Customer.create!(name: "Ayesha")
        b = Customer.create!(name: "Bilal")
        # A payment numbered the old way: there is no counter row yet.
        CustomerPayment.create!(customer: a, number: 7, amount_minor: 1_000, payment_method: PaymentMethod.find_by!(code: "cash"), business_day: today_for(biz), received_at: Time.current)
        expect(receive!(biz, b, owner).number).to eq(8)
        expect(receive!(biz, a, owner).number).to eq(9)
        expect(DocumentCounter.where(business_id: biz.id, kind: "customer_payment").pick(:last_number)).to eq(9)
      end
    end
  end

  describe "two customers paying at the same moment" do
    # Threads need committed rows, so this group runs outside the test transaction and removes what it made afterwards.
    self.use_transactional_tests = false

    let!(:owner) { signup_business(name: "Numbering Cafe") }
    let(:biz) { owner.business }

    after do
      conn = ActiveRecord::Base.connection
      ids = Business.where(name: "Numbering Cafe").pluck(:id)
      user_ids = Membership.unscoped.where(business_id: ids).pluck(:user_id)
      tables = conn.tables.select { |t| conn.column_exists?(t, :business_id) } - %w[audit_logs]
      6.times do
        tables = tables.reject do |t|
          conn.execute("DELETE FROM #{conn.quote_table_name(t)} WHERE business_id IN (#{ids.map { |i| conn.quote(i) }.join(',')})")
          true
        rescue ActiveRecord::StatementInvalid
          false
        end
        break if tables.empty?
      end
      Business.where(id: ids).delete_all
      User.where(id: user_ids).delete_all
    end

    # Until another connection to this database waits on a lock: the second payment waiting for the first.
    def wait_for_a_lock_wait
      50.times do
        return if ActiveRecord::Base.connection.select_value("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'").to_i.positive?
        sleep 0.1
      end
    end

    it "gives each payment its own number" do
      a, b = within(biz) do
        PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
        [ Customer.create!(name: "Ayesha"), Customer.create!(name: "Bilal") ]
      end
      taken = Queue.new
      release = Queue.new
      pay = lambda do |customer, hold|
        ActiveRecord::Base.connection_pool.with_connection do
          Tenancy::Context.with(biz, user: owner.user, membership: owner) do
            ActiveRecord::Base.transaction do
              number = receive!(biz, customer, owner).number
              # The first payment stays uncommitted, number and all, while the second is made.
              if hold
                taken << true
                release.pop
              end
              number
            end
          end
        end
      rescue ActiveRecord::RecordNotUnique => e
        e.class.name
      end
      first = Thread.new { pay.call(a, true) }
      taken.pop
      second = Thread.new { pay.call(b, false) }
      wait_for_a_lock_wait
      release << true
      expect([ first.value, second.value ]).to eq([ 1, 2 ])
      expect(within(biz) { CustomerPayment.order(:number).pluck(:number, :customer_id) }).to eq([ [ 1, a.id ], [ 2, b.id ] ])
    end
  end
end
