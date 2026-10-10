require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
abort("The Rails environment is running in production mode!") if Rails.env.production?
require "rspec/rails"

Dir[Rails.root.join("spec/support/**/*.rb")].sort.each { |f| require f }

begin
  ActiveRecord::Migration.maintain_test_schema!
rescue ActiveRecord::PendingMigrationError => e
  abort e.to_s.strip
end

RSpec.configure do |config|
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
  config.include FactoryBot::Syntax::Methods
  config.include RequestHelpers
  config.include ActiveJob::TestHelper
  config.include ActiveSupport::Testing::TimeHelpers

  config.before(:suite) do
    conn = ActiveRecord::Base.connection
    tables = conn.tables.select { |t| conn.column_exists?(t, :business_id) && !%w[audit_logs feature_flags whatsapp_messages].include?(t) }
    Servio::Rls.apply!(tables)
    Servio::Triggers.apply!(conn)
    Plan.seed!
  end

  config.before(:each) do
    Current.reset
    Current.allow_unscoped = true
  end

  config.after(:each) { Current.reset }
end

Shoulda::Matchers.configure do |config|
  config.integrate do |with|
    with.test_framework :rspec
    with.library :rails
  end
end
