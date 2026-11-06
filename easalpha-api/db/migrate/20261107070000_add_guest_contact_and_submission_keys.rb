# Final fix round of 6 Nov 2026 (P7):
# - A storefront guest whose phone the till already knows is attached to nobody, so their phone and delivery address
#   live on the order itself (guest_phone, delivery_address) for the cashier, the rider and the delivery board.
# - A QR guest's round added to a table's running order keeps its submit key on its lines (order_items.qr_ref), so a
#   cashier who rejects the round takes off those lines and nothing the waiter rang up.
# - A guest's submit key (aggregator_ref "qr:..." or "online:...") makes one order only: two submits at once used to
#   both pass the check and both create one. Keys that already repeat keep the first order's; the later ones get a
#   suffix so the index can be built.
class AddGuestContactAndSubmissionKeys < ActiveRecord::Migration[8.1]
  def up
    add_column :orders, :guest_phone, :string
    add_column :orders, :delivery_address, :string
    add_column :order_items, :qr_ref, :string

    execute <<~SQL
      UPDATE orders SET aggregator_ref = orders.aggregator_ref || ':dup:' || orders.id
      FROM (
        SELECT id, row_number() OVER (PARTITION BY business_id, aggregator_ref ORDER BY created_at, id) AS n
        FROM orders WHERE source IN ('qr', 'online') AND aggregator_ref IS NOT NULL
      ) ranked
      WHERE ranked.id = orders.id AND ranked.n > 1
    SQL
    add_index :orders, %i[business_id aggregator_ref], unique: true, where: "source IN ('qr', 'online') AND aggregator_ref IS NOT NULL", name: "index_orders_one_per_guest_submit"
  end

  def down
    remove_index :orders, name: "index_orders_one_per_guest_submit"
    remove_column :order_items, :qr_ref
    remove_column :orders, :delivery_address
    remove_column :orders, :guest_phone
  end
end
