class TokensChannel < ApplicationCable::Channel
  def subscribed
    branch = branch_id
    stream_from "tokens:#{principal[:business_id]}:#{branch}" if branch
  end
end
