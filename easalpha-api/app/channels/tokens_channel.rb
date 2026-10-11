class TokensChannel < ApplicationCable::Channel
  def subscribed
    stream_from "tokens:#{principal[:business_id]}:#{branch_id}"
  end
end
