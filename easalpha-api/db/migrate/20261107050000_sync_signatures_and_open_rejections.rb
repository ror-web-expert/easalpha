# Final round of 6 Nov 2026 (P5).
# Signed sync records: a till's PIN sign-in gets a sync key derived from its first refresh token's id, and each
# rotation keeps that id as session_root_id, so a refresh answers the same key and the server can tell when that
# sign-in's session ended (Sync::Signature).
# K7: a record refused again by the same till updates its open refusal instead of adding one. The older open copies
# every Try again left behind are closed as superseded, so one open row per till and record can be enforced.
class SyncSignaturesAndOpenRejections < ActiveRecord::Migration[8.1]
  def up
    add_column :refresh_tokens, :session_root_id, :uuid
    add_index :refresh_tokens, :session_root_id

    execute <<~SQL
      UPDATE sync_rejections SET resolved_at = now(), resolution = 'superseded', updated_at = now()
      WHERE id IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY device_id, record_type, record_id ORDER BY created_at DESC, id DESC) AS n
          FROM sync_rejections WHERE resolved_at IS NULL
        ) copies WHERE n > 1
      )
    SQL
    add_index :sync_rejections, %i[device_id record_type record_id], unique: true, where: "resolved_at IS NULL", name: "index_sync_rejections_open_once"
    add_index :sync_rejections, %i[record_type record_id]
  end

  def down
    remove_index :sync_rejections, %i[record_type record_id]
    remove_index :sync_rejections, name: "index_sync_rejections_open_once"
    remove_index :refresh_tokens, :session_root_id
    remove_column :refresh_tokens, :session_root_id
  end
end
