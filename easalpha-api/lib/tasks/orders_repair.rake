namespace :orders do
  desc "Correct open orders hit by the regular-discount bug (13 Oct 2026). DRY_RUN=0 to write; SLUG=demo-cafe for one business."
  task repair_regular_discounts: :environment do
    dry = ENV.fetch("DRY_RUN", "1") != "0"
    businesses = ENV["SLUG"].present? ? Business.where(slug: ENV["SLUG"]) : Business.all
    Tenancy::Context.unscoped { businesses.to_a }.each do |b|
      Tenancy::Context.with(b) do
        rows = Orders::RegularDiscountRepair.run!(dry_run: dry)
        next if rows.empty?
        puts "#{b.name} (#{b.slug}): #{rows.size} order(s)#{dry ? ' (dry run, nothing written)' : ''}"
        rows.each { |r| puts "  #{r[:order]} #{r[:business_day]} #{r[:customer]}: discount #{r[:discount_was]} -> #{r[:discount_now]} paisa, total #{r[:total_was]} -> #{r[:total_now] || '?'}, paid #{r[:paid]}: #{r[:action]}" }
      end
    end
  end
end
