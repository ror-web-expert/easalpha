# The till's own id for a line, kept beside the server's, so an update from a till that still holds its ids (an order
# made offline, edited before the till saw the server's copy) finds its lines instead of adding them again.
class AddClientLineIdToOrderItems < ActiveRecord::Migration[8.1]
  def change
    add_column :order_items, :client_line_id, :uuid
  end
end
