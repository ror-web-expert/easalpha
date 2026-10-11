# Servio API (Rails 8). Build: docker build -t servio-api servio-api
FROM ruby:3.3.4-slim
RUN apt-get update -qq && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev git curl pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /rails
ENV RAILS_ENV=production BUNDLE_DEPLOYMENT=1 BUNDLE_WITHOUT="development test" RAILS_LOG_TO_STDOUT=1
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache
COPY . .
RUN mkdir -p storage tmp/pids log && chmod +x bin/*
EXPOSE 3001
CMD ["bin/rails", "server", "-b", "0.0.0.0", "-p", "3001"]
