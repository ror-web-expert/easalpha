require "rails_helper"

RSpec.describe SafeCsv do
  it "writes formula-like text as text and leaves numbers, dates and blanks alone" do
    out = described_class.generate { |csv| csv << [ "=HYPERLINK(\"http://x\")", "+92300", "-Ali", "@cmd", "\tx", -16.0, 42, Date.new(2026, 11, 6), nil, "Chai" ] }
    expect(CSV.parse_line(out)).to eq([ "'=HYPERLINK(\"http://x\")", "'+92300", "'-Ali", "'@cmd", "'\tx", "-16.0", "42", "2026-11-06", nil, "Chai" ])
  end
end

RSpec.describe SafeCsv, ".parse" do
  it "drops the apostrophe an export put in front of a formula-like cell, and nothing else" do
    data = SafeCsv.generate { |csv| csv << %w[name phone note]; csv << [ "=Ali", "+923001112233", "it's fine" ] }
    rows = described_class.parse(data, headers: true)
    expect(rows.first.to_h).to eq("name" => "=Ali", "phone" => "+923001112233", "note" => "it's fine")
  end
end
