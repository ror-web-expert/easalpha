# EasAlpha API (Rails 8). Build: docker build -t easalpha-api easalpha-api
FROM ruby:3.3.4-slim
RUN apt-get update -qq && apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev git curl pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /rails
ENV RAILS_ENV=production BUNDLE_DEPLOYMENT=1 BUNDLE_WITHOUT="development test" RAILS_LOG_TO_STDOUT=1
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache
COPY . .
# The server runs as rails (uid 1000), not root: storage, tmp and log are the directories it writes. An existing
# storage volume on a server was made by root; chown it once before this image starts (deploy/DEPLOY notes).
RUN mkdir -p storage tmp/pids log && chmod +x bin/* && useradd -r -u 1000 -m -d /home/rails rails && chown -R rails:rails /rails
USER rails
EXPOSE 3001
CMD ["bin/rails", "server", "-b", "0.0.0.0", "-p", "3001"]
