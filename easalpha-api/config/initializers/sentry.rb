# Error tracking, on only when SENTRY_DSN is set (deploy/.env). Nothing personal leaves: no request bodies, no
# cookies, no user identities beyond the request id already in the logs.
if ENV["SENTRY_DSN"].present? && defined?(Sentry)
  Sentry.init do |config|
    config.dsn = ENV["SENTRY_DSN"]
    config.environment = ENV.fetch("SENTRY_ENVIRONMENT", Rails.env)
    config.release = "easalpha-api@#{EasAlpha::VERSION}"
    config.send_default_pii = false
    config.breadcrumbs_logger = [ :active_support_logger ]
    config.traces_sample_rate = ENV.fetch("SENTRY_TRACES_SAMPLE_RATE", "0.02").to_f
    config.excluded_exceptions += %w[Api::Errors::ApiError ActiveRecord::RecordNotFound ActionController::ParameterMissing]
  end
end
