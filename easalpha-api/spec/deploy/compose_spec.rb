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
    %w[docker-compose.images.yml docker-compose.proxy.yml docker-compose.caddy.yml docker-compose.tunnel.yml].each do |file|
      services = compose(file)["services"]
      expect(services).not_to have_key("volume-owner"), file
      # A service an overlay adds (caddy) brings its own; one the base file defines keeps the base's wiring.
      services.slice(*base.keys).each { |name, s| expect(s.keys & %w[volumes depends_on]).to eq([]), "#{file} changes #{name}" }
    end
  end

  # 26 Nov 2026: the shared server went down. The new one is a VM nothing on the internet reaches, so a Cloudflare
  # Tunnel brings the traffic in (docker-compose.tunnel.yml); docker-compose.caddy.yml is for a server with its own address.
  describe "the Cloudflare Tunnel overlay, production since 26 Nov 2026" do
    let(:overlay) { compose("docker-compose.tunnel.yml")["services"] }
    let(:raw) { File.read(dir.join("docker-compose.tunnel.yml")) }
    let(:caddyfile) { File.read(dir.join("caddy-tunnel/Caddyfile")) }

    it "is what .env.example selects and what server-env.sh writes by default" do
      expect(File.read(dir.join(".env.example"))).to match(/^COMPOSE_FILE=docker-compose.yml:docker-compose.images.yml:docker-compose.tunnel.yml$/)
      script = File.read(Rails.root.join("../scripts/server-env.sh"))
      expect(script).to include('PROXY="${PROXY:-tunnel}"', 'set_var COMPOSE_FILE "docker-compose.yml:docker-compose.images.yml:docker-compose.$PROXY.yml"')
    end

    it "publishes no port at all: cloudflared dials out, Caddy and the apps stay inside the compose network" do
      expect(overlay.keys).to contain_exactly("cloudflared", "caddy", "api", "web")
      expect(overlay.values_at("cloudflared", "caddy").map { |sv| sv["ports"] }).to all(be_nil)
      expect(raw).to match(/^  api:\n    ports: !reset \[\]$/).and match(/^  web:\n    ports: !reset \[\]$/)
    end

    it "runs the tunnel from the token in .env and refuses to start without one" do
      tunnel = overlay.fetch("cloudflared")
      expect(tunnel["command"]).to eq(%w[tunnel --no-autoupdate run])
      expect(tunnel["environment"]["TUNNEL_TOKEN"]).to start_with("${TUNNEL_TOKEN:?")
      expect(File.read(dir.join(".env.example"))).to match(/^TUNNEL_TOKEN=$/)
    end

    it "mounts the caddy-tunnel folder, so the deploy's reload reads the Caddyfile rsync replaced" do
      expect(mounts(overlay.fetch("caddy"))).to include("./caddy-tunnel:/etc/caddy:ro", "caddy_data:/data")
    end

    it "serves the three names over plain HTTP to web and api, with the body limit and the customer's address" do
      expect(caddyfile).to include("auto_https off", "http://easalpha.com, http://www.easalpha.com {", "reverse_proxy web:3000 {",
                                   "http://api.easalpha.com {", "reverse_proxy api:3001 {", "max_size 25MB")
      expect(caddyfile.scan("import upstream_headers").size).to eq(2)
      # Only cloudflared reaches it (no published port), from the compose network's private range.
      expect(caddyfile).to include("trusted_proxies static private_ranges", "client_ip_headers CF-Connecting-IP", "header_up X-Forwarded-For {client_ip}")
    end

    it "lets both workflows that SSH to the server join the tailnet first, when the Tailscale client is set" do
      %w[deploy.yml desktop.yml].each do |file|
        wf = YAML.safe_load(File.read(Rails.root.join("../.github/workflows", file)))
        job = wf["jobs"][file == "deploy.yml" ? "deploy" : "publish"]
        expect(job["env"]["TS_OAUTH_CLIENT_ID"]).to eq("${{ secrets.TS_OAUTH_CLIENT_ID }}"), file
        names = job["steps"].map { |st| st["name"] || st["uses"] }
        join = job["steps"].find { |st| st["uses"].to_s.start_with?("tailscale/github-action@") }
        expect(join).not_to be_nil, file
        expect(join["with"]).to include("tags" => "tag:ci", "oauth-secret" => "${{ secrets.TS_OAUTH_SECRET }}")
        expect(join["if"]).to include("env.TS_OAUTH_CLIENT_ID != ''")
        ssh_step = names.index { |n| n.to_s.match?(/SSH key|Upload to the website server/) }
        expect(names.index("Join the tailnet")).to be < ssh_step, "#{file}: the tailnet must be joined before the first SSH"
      end
    end

    describe "the deploy workflow (deploy.yml, 26 Nov 2026)" do
      let(:workflows) { Rails.root.join("../.github/workflows") }
      let(:deploy) { YAML.safe_load(File.read(workflows.join("deploy.yml"))) }
      let(:raw) { File.read(workflows.join("deploy.yml")) }
      let(:steps) { deploy["jobs"]["deploy"]["steps"] }

      it "runs after a successful image build, never straight from a push, and can be run by hand" do
        triggers = deploy[true] || deploy["on"] # YAML 1.1 reads a bare "on" key as true
        expect(triggers.keys).to contain_exactly("workflow_call", "workflow_dispatch")
        call = YAML.safe_load(File.read(workflows.join("images.yml")))["jobs"]["deploy"]
        expect(call).to include("needs" => "build", "uses" => "./.github/workflows/deploy.yml", "secrets" => "inherit")
        expect(call["with"]["sha"]).to eq("${{ github.event.workflow_run.head_sha || github.sha }}")
        expect(call["if"]).to include("github.event.workflow_run.conclusion == 'success'")
      end

      it "checks the server's host key against DEPLOY_KNOWN_HOSTS when it is set" do
        ssh = steps.find { |st| st["name"].to_s.start_with?("SSH key") }
        expect(ssh["env"]["DEPLOY_KNOWN_HOSTS"]).to eq("${{ secrets.DEPLOY_KNOWN_HOSTS }}")
        expect(ssh["run"]).to include('printf \'%s\\n\' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts', "StrictHostKeyChecking yes")
      end

      it "sends the registry token over stdin, never on the SSH command line" do
        pull = steps.find { |st| st["name"] == "Pull images and restart" }["run"]
        expect(pull).to include(%q(printf '%s' "$GHCR_TOKEN" | ssh server "docker login ghcr.io -u '$GHCR_USER' --password-stdin"))
        expect(pull.scan("$GHCR_TOKEN").size).to eq(1)
      end

      it "deploys the images of the release it was given and reloads Caddy" do
        expect(deploy["jobs"]["deploy"]["env"]["RELEASE"]).to eq("${{ inputs.sha || inputs.tag || github.sha }}")
        expect(raw).to include('echo "TAG=${FULL:0:7}" >> "$GITHUB_ENV"', "IMAGE_TAG=$TAG timeout 900 docker compose pull",
                               "caddy reload --config /etc/caddy/Caddyfile")
      end
    end
  end

  describe "the Caddy overlay for a server with its own public address" do
    let(:overlay) { compose("docker-compose.caddy.yml")["services"] }
    let(:caddyfile) { File.read(dir.join("caddy/Caddyfile")) }
    let(:raw) { File.read(dir.join("docker-compose.caddy.yml")) }

    it "publishes only Caddy: web and api keep no host port (Docker's published ports go around ufw)" do
      expect(overlay.fetch("caddy")["ports"]).to contain_exactly("80:80", "443:443", "443:443/udp")
      expect(raw).to match(/^  api:\n    ports: !reset \[\]$/).and match(/^  web:\n    ports: !reset \[\]$/)
      expect(overlay.keys).to contain_exactly("caddy", "api", "web")
    end

    it "mounts the caddy folder, not the file, so a Caddyfile the deploy's rsync replaced is what reload reads" do
      expect(mounts(overlay.fetch("caddy"))).to include("./caddy:/etc/caddy:ro", "caddy_data:/data")
      expect(compose("docker-compose.caddy.yml")["volumes"].keys).to include("caddy_data")
      expect(File.read(Rails.root.join("../.github/workflows/deploy.yml"))).to include("caddy reload --config /etc/caddy/Caddyfile")
    end

    it "proxies both names to the compose services with the client's own address in X-Forwarded-For" do
      expect(caddyfile).to include("easalpha.com, www.easalpha.com {", "reverse_proxy web:3000 {", "api.easalpha.com {", "reverse_proxy api:3001 {", "max_size 25MB")
      expect(caddyfile.scan("import upstream_headers").size).to eq(2)
      expect(caddyfile).to include("header_up X-Forwarded-For {client_ip}", "client_ip_headers CF-Connecting-IP")
      # CF-Connecting-IP is believed only from Cloudflare's own ranges; a private or catch-all range would let anyone set it.
      ranges = caddyfile[/trusted_proxies static (.+)$/, 1].split
      expect(ranges).to include("173.245.48.0/20", "104.16.0.0/13", "172.64.0.0/13", "2606:4700::/32")
      expect(ranges).not_to include("0.0.0.0/0", "::/0", "private_ranges")
      expect(ranges.map { |r| IPAddr.new(r) }.none?(&:private?)).to be(true)
    end
  end

  it "builds the API image with uid and gid 1000, the owner volume-owner gives the files" do
    dockerfile = File.read(Rails.root.join("Dockerfile"))
    expect(dockerfile).to include("groupadd --system --gid 1000 rails", "useradd --system --uid 1000 --gid rails", "USER rails")
    expect(File.read(Rails.root.join("../easalpha-whatsapp/Dockerfile"))).to include("USER node") # node:20-slim's node is 1000:1000
  end
end
