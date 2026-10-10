Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*ENV.fetch("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000").split(","))
    resource "*", headers: :any, methods: %i[get post put patch delete options head], expose: %w[X-Request-Id], credentials: false
  end
end
