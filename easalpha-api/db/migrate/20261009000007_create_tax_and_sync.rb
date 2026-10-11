class CreateTaxAndSync < ActiveRecord::Migration[8.0]
  def up
    create_table :tax_invoices, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :branch, type: :uuid, null: false, foreign_key: true
      t.references :order, type: :uuid, null: false, foreign_key: true, index: { unique: true }
      t.string :authority, null: false
      t.jsonb :request_payload, null: false, default: {}
      t.jsonb :response_payload, null: false, default: {}
      t.string :invoice_number
      t.text :qr_payload
      t.string :status, null: false, default: "queued"
      t.integer :attempts, null: false, default: 0
      t.text :last_error
      t.datetime :next_attempt_at
      t.datetime :sent_at
      t.timestamps
    end
    add_index :tax_invoices, [ :business_id, :status ]
    add_check_constraint :tax_invoices, "status in ('queued','sent','accepted','failed','skipped')", name: "tax_invoices_status_check"

    create_table :sync_batches, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :device_id, null: false
      t.string :direction, null: false
      t.integer :record_count, null: false, default: 0
      t.integer :accepted, null: false, default: 0
      t.integer :duplicates, null: false, default: 0
      t.integer :rejected, null: false, default: 0
      t.string :cursor_before
      t.string :cursor_after
      t.datetime :started_at, null: false
      t.datetime :finished_at
      t.text :error
      t.timestamps
    end
    add_index :sync_batches, [ :business_id, :device_id, :started_at ]

    create_table :sync_rejections, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :branch_id
      t.uuid :device_id, null: false
      t.uuid :sync_batch_id
      t.string :record_type, null: false
      t.uuid :record_id, null: false
      t.string :code, null: false
      t.text :message
      t.jsonb :payload, null: false, default: {}
      t.datetime :resolved_at
      t.uuid :resolved_by_membership_id
      t.string :resolution
      t.timestamps
    end
    add_index :sync_rejections, [ :business_id, :resolved_at ]

    EasAlpha::Rls.apply!(%w[tax_invoices sync_batches sync_rejections])
  end

  def down
    drop_table :sync_rejections, :sync_batches, :tax_invoices
  end
end
