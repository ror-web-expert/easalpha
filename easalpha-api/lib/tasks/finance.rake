namespace :finance do
  # Runs one Finance::Backfill step for every live business (or SLUG=... for one) and prints what it posts. A dry run
  # unless DRY_RUN=0: then nothing is written and the vouchers shown are the ones the real run would post.
  backfill = lambda do |step, what|
    dry = ENV.fetch("DRY_RUN", "1") != "0"
    businesses = Business.where.not(status: "deleted")
    businesses = businesses.where(slug: ENV["SLUG"]) if ENV["SLUG"].present?
    Tenancy::Context.unscoped { businesses.to_a }.each do |b|
      Tenancy::Context.with(b) do
        rows = Finance::Backfill.public_send(step, dry_run: dry)
        next if rows.empty?
        puts "#{b.name} (#{b.slug}): #{rows.size} #{what}#{dry ? ' (dry run, nothing written)' : ''}"
        rows.each do |r|
          puts "  #{r[:text]}"
          r[:lines].each { |l| puts "    #{l}" }
        end
      end
    end
  end

  desc "Journal the khata refunds recorded before the khata refund journal existed (6 Nov 2026). Dry run unless DRY_RUN=0; SLUG=demo-cafe for one business."
  task backfill_khata_refunds: :environment do
    backfill.call(:khata_refunds!, "khata refund(s)")
  end

  desc "Journal supplier opening balances entered before openings were posted (7 Nov 2026). Dry run unless DRY_RUN=0; SLUG=... for one business."
  task backfill_supplier_openings: :environment do
    backfill.call(:supplier_openings!, "supplier opening(s)")
  end

  desc "Move the canteen subsidy and salary deduction balances out of Cash at Bank and close those accounts (7 Nov 2026). Dry run unless DRY_RUN=0; SLUG=... for one business."
  task reclass_internal_methods: :environment do
    backfill.call(:internal_methods!, "line(s) for internal methods")
  end
end
