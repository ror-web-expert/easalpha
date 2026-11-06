namespace :orders do
  desc "Correct open orders hit by the regular-discount bug (13 Oct 2026). DRY_RUN=0 to write; SLUG=demo-cafe for one business."
  task repair_regular_discounts: :environment do
    dry = ENV.fetch("DRY_RUN", "1") != "0"
    businesses = Business.where.not(status: "deleted") # a deleted business is shut out everywhere else too
    businesses = businesses.where(slug: ENV["SLUG"]) if ENV["SLUG"].present?
    Tenancy::Context.unscoped { businesses.to_a }.each do |b|
      Tenancy::Context.with(b) do
        rows = Orders::RegularDiscountRepair.run!(dry_run: dry)
        next if rows.empty?
        puts "#{b.name} (#{b.slug}): #{rows.size} order(s)#{dry ? ' (dry run, nothing written)' : ''}"
        rows.each { |r| puts "  #{r[:order]} #{r[:business_day]} #{r[:customer]}: discount #{r[:discount_was]} -> #{r[:discount_now]} paisa, total #{r[:total_was]} -> #{r[:total_now]}, paid #{r[:paid]}: #{r[:action]}" }
      end
    end
  end

  desc "Orders part-refunded before 7 Nov 2026 that still read Partial with a balance due. DRY_RUN=0 to write; SLUG=demo-cafe for one business."
  task repair_part_refunds: :environment do
    dry = ENV.fetch("DRY_RUN", "1") != "0"
    businesses = Business.where.not(status: "deleted")
    businesses = businesses.where(slug: ENV["SLUG"]) if ENV["SLUG"].present?
    Tenancy::Context.unscoped { businesses.to_a }.each do |b|
      Tenancy::Context.with(b) do
        rows = Orders::PartRefundRepair.run!(dry_run: dry)
        next if rows.empty?
        puts "#{b.name} (#{b.slug}): #{rows.size} order(s)#{dry ? ' (dry run, nothing written)' : ''}"
        rows.each { |r| puts "  #{r[:order]} #{r[:business_day]}: total #{r[:total]}, paid #{r[:paid_was]} -> #{r[:total]} (captured #{r[:captured]}, refunded #{r[:refunded]})" }
      end
    end
  end
end
