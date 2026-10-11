# Stock documents are now numbered per type (GRN-000023). Businesses that already hold documents numbered from the
# old single counter get each per-type counter seeded at their highest existing number, so the next number is free.
class SeedPerKindStockCounters < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      INSERT INTO document_counters (business_id, kind, last_number)
      SELECT business_id, 'stock_' || kind, MAX(number) FROM stock_documents GROUP BY business_id, kind
      ON CONFLICT (business_id, kind) DO UPDATE SET last_number = GREATEST(document_counters.last_number, EXCLUDED.last_number)
    SQL
  end

  def down; end
end
