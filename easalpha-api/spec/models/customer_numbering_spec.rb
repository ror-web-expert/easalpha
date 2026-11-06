require "rails_helper"

# F8 (final round of 6 Nov 2026): two new storefront guests ordering at the same moment both got khata number max + 1,
# and the unique index turned the second order into an HTTP 500 (the admin API answered a misleading 409). Customers
# are numbered from the business's counter now, as customer payments are, and the storefront rides out a phone that
# two submits create at once.
RSpec.describe Customer, type: :model do
  describe "numbering" do
    let!(:owner) { signup_business }
    let(:biz) { owner.business }

    it "numbers customers in one sequence that carries on from the numbers given before the counter" do
      within(biz) do
        Customer.create!(name: "Imported", khata_no: 40)
        expect(Customer.create!(name: "Ayesha").khata_no).to eq(41)
        expect(Customer.create!(name: "Bilal").khata_no).to eq(42)
        expect(DocumentCounter.where(business_id: biz.id, kind: "customer_khata_no").pick(:last_number)).to eq(42)
      end
    end
  end

  describe "the admin API in a race on one phone", type: :request do
    let!(:owner) { signup_business }

    it "answers that the phone exists, not that a record id is taken" do
      allow(Customer).to receive(:create!).and_raise(ActiveRecord::RecordNotUnique, 'PG::UniqueViolation: duplicate key value violates unique constraint "index_customers_on_business_id_and_phone"')
      post "/api/v1/customers", params: { name: "Hira", phone: "03005556677" }.to_json, headers: auth_headers(owner)
      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body).dig("error", "code")).to eq("customer.phone_exists")
    end
  end

  describe "at the same moment" do
    # Threads need committed rows, so this group runs outside the test transaction and removes what it made afterwards.
    self.use_transactional_tests = false

    let!(:owner) { signup_business(name: "Numbering Guests Cafe") }
    let(:biz) { owner.business }
    let!(:m) { build_menu!(biz) }

    after do
      conn = ActiveRecord::Base.connection
      ids = Business.where(name: "Numbering Guests Cafe").pluck(:id)
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

    def wait_for_a_lock_wait
      50.times do
        return if ActiveRecord::Base.connection.select_value("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'").to_i.positive?
        sleep 0.1
      end
    end

    # Two storefront orders: the first stays uncommitted after it is placed while the second is placed.
    def two_guests(first, second)
      cfg = within(biz) do
        c = WebsiteConfig.for_business!
        c.update!(published: true, slug: "numbering-guests", sections: c.sections.deep_merge("delivery" => { "enabled" => true, "min_order_minor" => 0 }))
        c
      end
      taken = Queue.new
      release = Queue.new
      place = lambda do |guest, hold|
        ActiveRecord::Base.connection_pool.with_connection do
          Tenancy::Context.with(biz) do
            ActiveRecord::Base.transaction do
              order = Storefront::Ordering.place!(biz, cfg, lines: [ { product_id: m[:chai].id, quantity: 1 } ], order_type: "takeaway", customer: guest, client_id: SecureRandom.uuid)
              if hold
                taken << true
                release.pop
              end
              order.id
            end
          end
        end
      rescue StandardError => e
        e.class.name
      end
      a = Thread.new { place.call(first, true) }
      taken.pop
      b = Thread.new { place.call(second, false) }
      wait_for_a_lock_wait
      release << true
      [ a.value, b.value ]
    end

    it "gives two customers made at the same moment their own numbers" do
      taken = Queue.new
      release = Queue.new
      make = lambda do |name, hold|
        ActiveRecord::Base.connection_pool.with_connection do
          Tenancy::Context.with(biz) do
            ActiveRecord::Base.transaction do
              number = Customer.create!(name: name).khata_no
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
      first = Thread.new { make.call("Ayesha", true) }
      taken.pop
      second = Thread.new { make.call("Bilal", false) }
      wait_for_a_lock_wait
      release << true
      expect(second.value).to eq(first.value + 1)
    end

    it "takes both orders of two new guests, each with their own number" do
      ids = two_guests({ name: "Sara", phone: "03001230000" }, { name: "Asad", phone: "03001230001" })
      within(biz) do
        expect(Order.where(id: ids).count).to eq(2)
        numbers = Customer.where(phone: %w[+923001230000 +923001230001]).pluck(:khata_no).sort
        expect(numbers.last - numbers.first).to eq(1) # one after the other, never the same
      end
    end

    it "takes both orders when two submits bring the same new phone, on one customer" do
      ids = two_guests({ name: "Sara", phone: "03001230000" }, { name: "Sara", phone: "0300 1230000" })
      within(biz) do
        expect(Order.where(id: ids).count).to eq(2)
        expect(Order.where(id: ids).distinct.pluck(:customer_id).size).to eq(1)
        expect(Customer.where(phone: "+923001230000").count).to eq(1)
      end
    end
  end
end
