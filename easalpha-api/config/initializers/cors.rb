origins = ENV.fetch("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000").split(",").map(&:strip)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*origins)
    resource "*", headers: :any, methods: %i[get post put patch delete options head], expose: %w[X-Request-Id], credentials: false
  end
end

# Review 6 (17 Oct 2026): Timing-Allow-Origin lets the web app's own performance monitoring read the timings and
# transfer sizes of API responses (Resource Timing hides them across origins otherwise). Same origins as CORS.
class TimingAllowOrigin
  def initialize(app, value)
    @app, @value = app, value
  end

  def call(env)
    status, headers, body = @app.call(env)
    headers["timing-allow-origin"] ||= @value
    [ status, headers, body ]
  end
end
Rails.application.config.middleware.insert_after Rack::Cors, TimingAllowOrigin, origins.join(", ")
