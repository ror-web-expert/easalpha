namespace :demo do
  desc "Seed a month of realistic demo history for a business (DEMO_SLUG, default demo-cafe; DAYS, default 30). Runs once; a second run is skipped."
  task rich: :environment do
    slug = ENV.fetch("DEMO_SLUG", "demo-cafe")
    days = ENV.fetch("DAYS", "30").to_i
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    result = Demo::RichSeed.run!(business_slug: slug, days: days, log: ->(msg) { puts msg })
    elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(1)
    puts(result.skipped ? "Demo data already seeded for #{slug} (marker #{Demo::RichSeed::MARKER} present); nothing changed." : "Seeded #{days} days of demo data for #{slug} in #{elapsed}s")
    result.counts.each { |k, v| puts "  #{k}: #{v.is_a?(Hash) ? v.map { |a, b| "#{a}=#{b}" }.join(', ') : v}" }
  end
end

namespace :demo do
  desc "Create (or complete) the demo restaurant for client demos, then seed its history. DEMO_EMAIL (default demo@easalpha.com), DEMO_PASSWORD (required), DEMO_NAME (default Demo Cafe), DAYS (default 30)."
  task business: :environment do
    email = ENV.fetch("DEMO_EMAIL", "demo@easalpha.com")
    password = ENV["DEMO_PASSWORD"].presence or abort "Set DEMO_PASSWORD"
    r = Demo::Restaurant.seed!(email: email, password: password, business_name: ENV.fetch("DEMO_NAME", "Demo Cafe"), log: ->(m) { puts m })
    result = Demo::RichSeed.run!(business_slug: r.business.slug, days: ENV.fetch("DAYS", "30").to_i, log: ->(m) { puts m })
    puts(result.skipped ? "History already seeded for #{r.business.slug}." : "Seeded #{ENV.fetch('DAYS', '30')} days of history for #{r.business.slug}")
    result.counts.each { |k, v| puts "  #{k}: #{v.is_a?(Hash) ? v.map { |a, b| "#{a}=#{b}" }.join(', ') : v}" }
    puts "Login: #{email} / (DEMO_PASSWORD)   manager PIN #{Demo::Restaurant::MANAGER_PIN}, cashier PIN #{Demo::Restaurant::CASHIER_PIN}, till code #{Demo::Restaurant::TILL_CODE}, kitchen code #{Demo::Restaurant::KITCHEN_CODE}"
  end
end
