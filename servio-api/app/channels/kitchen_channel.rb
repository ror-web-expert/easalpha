class KitchenChannel < ApplicationCable::Channel
  def subscribed
    stream_from "kitchen:#{principal[:business_id]}:#{branch_id}"
  end
end
