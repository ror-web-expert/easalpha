# SPEC "Inventory and recipes": system sections with a COGS-primary flag and slugs, item active flag, conversions stored
# in each direction, the document register's eight types and five statuses, approvals and transit, and full-precision
# quantities in the base unit.
class InventorySpecRegister < ActiveRecord::Migration[8.0]
  QTY = { precision: 20, scale: 9 }.freeze

  def up
    add_column :stock_sections, :is_system, :boolean, null: false, default: false
    add_column :stock_sections, :cogs_primary, :boolean, null: false, default: false
    add_column :stock_sections, :slug, :string
    add_index :stock_sections, [ :branch_id, :slug ], unique: true, where: "archived_at IS NULL"

    add_column :stock_items, :active, :boolean, null: false, default: true

    create_table :unit_conversions, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.uuid :from_unit_id, null: false
      t.uuid :to_unit_id, null: false
      t.decimal :factor, precision: 18, scale: 9, null: false
      t.timestamps
    end
    add_index :unit_conversions, [ :from_unit_id, :to_unit_id ], unique: true

    remove_check_constraint :stock_documents, name: "stock_documents_kind_check"
    add_check_constraint :stock_documents, "kind IN ('receive', 'po_receipt', 'transfer', 'waste', 'adjustment', 'count', 'opening_balance', 'production', 'supplier_return')", name: "stock_documents_kind_check"
    remove_check_constraint :stock_documents, name: "stock_documents_status_check"
    add_check_constraint :stock_documents, "status IN ('draft', 'awaiting_approval', 'in_transit', 'posted', 'voided', 'cancelled')", name: "stock_documents_status_check"
    add_column :stock_documents, :approved_by_membership_id, :uuid
    add_column :stock_documents, :dispatched_at, :datetime
    add_column :stock_documents, :received_at, :datetime
    add_column :stock_documents, :purchase_order_id, :uuid
    add_column :stock_documents, :posting_date, :date

    change_column :stock_levels, :quantity, :decimal, **QTY
    %i[quantity before_qty after_qty].each { |c| change_column :stock_ledger_entries, c, :decimal, **QTY }
    %i[quantity base_quantity counted_qty expected_qty].each { |c| change_column :stock_document_lines, c, :decimal, **QTY }
    %i[quantity base_quantity].each { |c| change_column :recipe_lines, c, :decimal, **QTY }
    change_column :order_type_consumables, :quantity, :decimal, **QTY
    change_column :packaging_rules, :quantity, :decimal, **QTY
    %i[minimum_qty reorder_qty].each { |c| change_column :stock_items, c, :decimal, **QTY }
    %i[quantity base_quantity received_base_qty].each { |c| change_column :purchase_order_lines, c, :decimal, **QTY }
    %i[quantity base_quantity].each { |c| change_column :goods_receipt_lines, c, :decimal, **QTY }

    Servio::Rls.apply!(%w[unit_conversions])
  end

  def down
    drop_table :unit_conversions
    remove_column :stock_documents, :posting_date
    remove_column :stock_documents, :purchase_order_id
    remove_column :stock_documents, :received_at
    remove_column :stock_documents, :dispatched_at
    remove_column :stock_documents, :approved_by_membership_id
    remove_column :stock_items, :active
    remove_index :stock_sections, [ :branch_id, :slug ]
    remove_column :stock_sections, :slug
    remove_column :stock_sections, :cogs_primary
    remove_column :stock_sections, :is_system
  end
end
