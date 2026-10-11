namespace :db do
  desc "Re-apply Row-Level Security policies to every table that has business_id"
  task rls: :environment do
    conn = ActiveRecord::Base.connection
    tables = conn.tables.select { |t| conn.column_exists?(t, :business_id) && t != "audit_logs" && t != "feature_flags" }
    EasAlpha::Rls.apply!(tables)
    puts "RLS applied to #{tables.size} tables"
  end
end
