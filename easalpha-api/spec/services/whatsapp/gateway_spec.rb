require "rails_helper"

RSpec.describe Whatsapp::Gateway do
  let(:business) { instance_double(Business, id: 7) }
  let(:sent) { [] }

  # Answers every gateway call with the given reply and keeps the requests; nothing leaves the machine.
  def gateway_replies(klass, code, body)
    res = klass.new("1.1", code, "")
    res.instance_variable_set(:@read, true)
    res.body = body.to_json
    http = double("http")
    allow(http).to receive(:request) { |req| sent << req; res }
    allow(Net::HTTP).to receive(:start) { |*_args, **_opts, &blk| blk.call(http) }
  end

  before { allow(described_class).to receive(:url).and_return("http://gateway.test") }

  it "sends a document up to 10 MB inline as base64" do
    gateway_replies(Net::HTTPOK, "200", { ok: true, message_id: "wamid.9" })
    data = "%PDF" + ("x" * (10.megabytes - 4))
    id = described_class.send_document!(business, to: "+923001234567", text: "Your bill", filename: "bill.pdf", data: data)
    expect(id).to eq("wamid.9")
    body = JSON.parse(sent.first.body)
    expect(body).to include("to" => "923001234567", "text" => "Your bill")
    expect(Base64.strict_decode64(body.dig("document", "base64")).bytesize).to eq(10.megabytes)
  end

  it "refuses a document over 10 MB with the reason and never calls the gateway" do
    gateway_replies(Net::HTTPOK, "200", { ok: true, message_id: "wamid.9" })
    expect {
      described_class.send_document!(business, to: "+923001234567", text: "Your bill", filename: "bill.pdf", data: "x" * 12.megabytes)
    }.to raise_error(Api::Errors::Conflict, /bill\.pdf is 12 MB; the linked phone sends files up to 10 MB/)
    expect(Net::HTTP).not_to have_received(:start)
  end

  it "passes on the reason the gateway gives in last_error" do
    gateway_replies(Net::HTTPPayloadTooLarge, "413", { ok: false, last_error: "document must be at most 10 MB" })
    expect {
      described_class.send_document!(business, to: "+923001234567", text: "Your bill", filename: "bill.pdf", data: "%PDF-1.4")
    }.to raise_error(Api::Errors::Conflict, "document must be at most 10 MB")
  end
end
