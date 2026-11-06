require "rails_helper"

RSpec.describe Device, "code" do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }

  it "takes the next free number of its kind, so a removed device never makes the next code clash" do
    Tenancy::Context.with(biz) do
      branch = Branch.first
      codes = 4.times.map { Device.create!(branch: branch, name: "Rider #{_1}", kind: "rider").code }
      expect(codes).to eq(%w[D1 D2 D3 D4])
      Device.find_by(code: "D2").destroy!
      expect(Device.create!(branch: branch, name: "Rider again", kind: "rider").code).to eq("D5")
      Device.create!(branch: branch, name: "Kiosk", kind: "kiosk")
      expect(Device.create!(branch: branch, name: "Another rider", kind: "rider").code).to eq("D6")
      expect(Device.create!(branch: branch, name: "Till", kind: "till").code).to match(/\AT\d+\z/)
    end
  end
end
