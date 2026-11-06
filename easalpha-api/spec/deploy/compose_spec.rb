require "rails_helper"

# deploy/ (6 Nov 2026 review, R32): the API, its job worker and the WhatsApp gateway run as uid 1000, and the storage
# and wasessions volumes on the server were made by an older root image, so a one-shot volume-owner service chowns
# them before any of those start. There is no Docker where the specs run: this reads the compose files and checks the
# wiring, which is all that can be checked here (the service itself has not run on a server yet).
RSpec.describe "deploy compose files" do
  let(:dir) { Rails.root.join("../deploy") }
  let(:base) { compose("docker-compose.yml")["services"] }

  def compose(name) = YAML.safe_load(File.read(dir.join(name)), aliases: true)
  def mounts(service) = Array(service["volumes"]).map { |v| v.is_a?(String) ? v : "#{v['source']}:#{v['target']}#{':ro' if v['read_only']}" }

  it "chowns the storage and WhatsApp session volumes to uid 1000 as root, once per up, with no network" do
    owner = base.fetch("volume-owner")
    expect(owner).to include("restart" => "no", "user" => "0:0", "network_mode" => "none")
    expect(owner["entrypoint"]).to eq(%w[chown -R 1000:1000 /rails/storage /app/sessions])
    expect(mounts(owner)).to contain_exactly("storage:/rails/storage", "wasessions:/app/sessions")
  end

  it "starts every service that writes either volume only after volume-owner exited 0" do
    writers = base.except("volume-owner").select { |_, s| mounts(s).any? { |m| m.match?(/\A(storage|wasessions):/) && !m.end_with?(":ro") } }
    expect(writers.keys).to contain_exactly("api", "jobs", "whatsapp")
    writers.each do |name, s|
      expect(s["depends_on"]).to be_a(Hash), "#{name} lists depends_on without conditions"
      expect(s["depends_on"]["volume-owner"]).to eq({ "condition" => "service_completed_successfully" }), name
    end
    expect(base["api"]["depends_on"]["db"]).to eq({ "condition" => "service_healthy" })
    expect(base["jobs"]["depends_on"]["api"]).to eq({ "condition" => "service_started" })
    expect(mounts(base["backup"])).to include("storage:/data/storage:ro", "wasessions:/data/wasessions:ro") # reads as root
  end

  it "leaves volumes, depends_on and volume-owner alone in the overlays" do
    %w[docker-compose.images.yml docker-compose.proxy.yml].each do |file|
      services = compose(file)["services"]
      expect(services).not_to have_key("volume-owner"), file
      services.each { |name, s| expect(s.keys & %w[volumes depends_on]).to eq([]), "#{file} changes #{name}" }
    end
  end

  it "builds the API image with uid and gid 1000, the owner volume-owner gives the files" do
    dockerfile = File.read(Rails.root.join("Dockerfile"))
    expect(dockerfile).to include("groupadd --system --gid 1000 rails", "useradd --system --uid 1000 --gid rails", "USER rails")
    expect(File.read(Rails.root.join("../easalpha-whatsapp/Dockerfile"))).to include("USER node") # node:20-slim's node is 1000:1000
  end
end
