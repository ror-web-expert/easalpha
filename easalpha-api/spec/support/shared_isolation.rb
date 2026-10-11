# Every tenant endpoint must deny reading or writing another business's records.
RSpec.shared_examples "tenant isolated" do |path_builder, methods: %i[get patch delete]|
  it "hides the record from another business" do
    other = signup_business(name: "Other Cafe")
    headers = auth_headers(other)
    path = instance_exec(&path_builder)
    get path, headers: headers if methods.include?(:get)
    expect(response.status).to eq(404), "GET #{path} returned #{response.status} for another business" if methods.include?(:get)
    if methods.include?(:patch)
      patch path, params: { name: "hacked" }.to_json, headers: headers
      expect(response.status).to eq(404), "PATCH #{path} returned #{response.status} for another business"
    end
    if methods.include?(:delete)
      delete path, headers: headers
      expect(response.status).to eq(404), "DELETE #{path} returned #{response.status} for another business"
    end
  end
end
