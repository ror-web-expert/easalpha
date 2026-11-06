require "rails_helper"
require "open3"

# bin/start (6 Nov 2026 review, R9): in production without EASALPHA_APP_DB_PASSWORD the API and the job worker connect
# as the database owner and Row-Level Security binds nothing, so every start says so loudly, and starts anyway. The
# script runs in a scratch folder against stand-ins for bin/rails and bin/jobs that print what they were asked and
# as whom, so nothing touches a database.
RSpec.describe "bin/start" do
  def start(role, env)
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "bin"))
      FileUtils.cp(Rails.root.join("bin/start"), File.join(dir, "bin/start"))
      %w[rails jobs].each do |name|
        File.write(File.join(dir, "bin", name), "#!/usr/bin/env bash\necho \"#{name} $* as ${PGUSER:-}\"\n")
        File.chmod(0o755, File.join(dir, "bin", name))
      end
      Open3.capture3(env, "bin/start", role, chdir: dir)
    end
  end

  it "warns loudly in production without the app role's password, and still starts" do
    out, err, status = start("api", { "RAILS_ENV" => "production", "EASALPHA_APP_DB_PASSWORD" => "", "PGUSER" => "postgres" })
    expect(status).to be_success
    expect(err).to include("WARNING: EASALPHA_APP_DB_PASSWORD is not set", "Row-Level", "\"rls\": false", "docs/DEPLOY.md")
    expect(out.lines.map(&:strip)).to eq([ "rails db:prepare as postgres", "rails db:seed as postgres", "rails db:rls as postgres", "rails server -b 0.0.0.0 -p 3001 as postgres" ])
    _out, err, status = start("jobs", { "RAILS_ENV" => "production", "PGUSER" => "postgres" }.merge("EASALPHA_APP_DB_PASSWORD" => nil))
    expect(status).to be_success
    expect(err).to include("WARNING: EASALPHA_APP_DB_PASSWORD is not set")
  end

  it "connects as easalpha_app with no warning once the password is set, after the owner's migrations and policies" do
    out, err, status = start("api", { "RAILS_ENV" => "production", "EASALPHA_APP_DB_PASSWORD" => "s3cret", "PGUSER" => "postgres" })
    expect(status).to be_success
    expect(err).to be_empty
    expect(out).to include("rails db:rls as postgres", "Row-Level Security applies", "rails server -b 0.0.0.0 -p 3001 as easalpha_app")
  end

  it "says nothing outside production" do
    out, err, status = start("jobs", { "RAILS_ENV" => "development", "EASALPHA_APP_DB_PASSWORD" => "", "PGUSER" => "postgres" })
    expect(status).to be_success
    expect(err).to be_empty
    expect(out).to include("jobs  as postgres")
  end
end
