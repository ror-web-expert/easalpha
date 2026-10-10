class OrdersChannel < ApplicationCable::Channel
  def subscribed
    stream_from "orders:#{principal[:business_id]}:#{branch_id}"
  end
end
