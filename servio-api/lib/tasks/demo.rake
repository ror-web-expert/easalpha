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
