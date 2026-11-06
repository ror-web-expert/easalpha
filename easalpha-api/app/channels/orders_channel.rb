class OrdersChannel < ApplicationCable::Channel
  def subscribed
    branch = branch_id
    stream_from "orders:#{principal[:business_id]}:#{branch}" if branch
  end
end
