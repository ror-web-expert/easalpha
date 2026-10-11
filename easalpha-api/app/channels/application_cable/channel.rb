module ApplicationCable
  class Channel < ActionCable::Channel::Base
    def branch_id = params[:branch_id].presence || principal[:branch_id]
  end
end
