require "rails_helper"

RSpec.describe AppliedSubmission, ".record!" do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:order_id) { SecureRandom.uuid }

  it "answers true once per key: the till is part of it, a guest's missing till counts as one key too" do
    Tenancy::Context.with(biz) do
      till, other = SecureRandom.uuid, SecureRandom.uuid
      expect(described_class.record!(device_id: till, record_type: "order_update", record_id: order_id, client_seq: 17)).to be true
      expect(described_class.record!(device_id: till, record_type: "order_update", record_id: order_id, client_seq: "17")).to be false
      expect(described_class.record!(device_id: till, record_type: "order_update", record_id: order_id, client_seq: 18)).to be true
      expect(described_class.record!(device_id: other, record_type: "order_update", record_id: order_id, client_seq: 17)).to be true
      expect(described_class.record!(record_type: "qr_add", record_id: order_id, client_seq: "qr:abc")).to be true
      expect(described_class.record!(record_type: "qr_add", record_id: order_id, client_seq: "qr:abc")).to be false
      expect(described_class.count).to eq(4)
    end
  end

  it "leaves nothing behind when the work it guards fails, so the retry is applied" do
    Tenancy::Context.with(biz) do
      expect do
        ActiveRecord::Base.transaction(requires_new: true) do
          described_class.record!(record_type: "order_update", record_id: order_id, client_seq: 1)
          raise ActiveRecord::Rollback
        end
      end.not_to change(described_class, :count)
      expect(described_class.record!(record_type: "order_update", record_id: order_id, client_seq: 1)).to be true
    end
  end

  it "needs a business" do
    expect { described_class.record!(record_type: "order_update", record_id: order_id, client_seq: 1) }.to raise_error(Tenanted::NoTenantError)
  end
end
