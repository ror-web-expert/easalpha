class KitchenChannel < ApplicationCable::Channel
  def subscribed
    branch = branch_id
    stream_from "kitchen:#{principal[:business_id]}:#{branch}" if branch
  end
end
