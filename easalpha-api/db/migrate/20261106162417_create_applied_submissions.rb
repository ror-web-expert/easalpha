# Review of 6 Nov 2026 (R17, R18): a submission a client may send twice is applied once. A till numbers each queued
# order update (client_seq); a QR guest's submit carries a client id. Each one applied is recorded here, keyed by the
# till that sent it (none for a guest), what it was about and that number, so a repeat is answered as a duplicate.
class CreateAppliedSubmissions < ActiveRecord::Migration[8.1]
  def up
    create_table :applied_submissions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true, index: false
      t.uuid :device_id
      t.string :record_type, null: false
      t.uuid :record_id, null: false
      t.string :client_seq, null: false
      t.uuid :order_id
      t.datetime :created_at, null: false
    end
    # A guest has no device: NULLS NOT DISTINCT keeps their keys unique too.
    add_index :applied_submissions, %i[business_id record_type record_id client_seq device_id], unique: true, nulls_not_distinct: true, name: "index_applied_submissions_once"
    EasAlpha::Rls.apply!(%w[applied_submissions])
  end

  def down
    drop_table :applied_submissions
  end
end
