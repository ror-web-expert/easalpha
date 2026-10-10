# Sections created before Phase 4 have no slug and no system flag. Give every section a slug from its name, mark
# Kitchen and Warehouse as system sections, and make Warehouse COGS Primary where the branch has none.
class BackfillStockSectionSlugs < ActiveRecord::Migration[8.0]
  def up
    rows = select_all("SELECT id, branch_id, name, archived_at FROM stock_sections ORDER BY created_at")
    taken = Hash.new { |h, k| h[k] = {} }
    rows.each do |r|
      base = r["name"].to_s.parameterize.presence || "section"
      slug = base
      n = 2
      if r["archived_at"].nil?
        while taken[r["branch_id"]][slug]
          slug = "#{base}-#{n}"
          n += 1
        end
        taken[r["branch_id"]][slug] = true
      end
      system = r["archived_at"].nil? && %w[kitchen warehouse].include?(slug)
      execute "UPDATE stock_sections SET slug = #{quote(slug)}, is_system = #{system} WHERE id = #{quote(r['id'])} AND slug IS NULL"
    end
    execute <<~SQL
      UPDATE stock_sections s SET cogs_primary = true
      WHERE s.slug = 'warehouse' AND s.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM stock_sections o WHERE o.branch_id = s.branch_id AND o.cogs_primary AND o.archived_at IS NULL)
    SQL
  end

  def down; end
end
