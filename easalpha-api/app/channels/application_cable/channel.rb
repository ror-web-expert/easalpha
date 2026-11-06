module ApplicationCable
  class Channel < ActionCable::Channel::Base
    # The branch asked for (or the token's own), only if the device sits at it or the member may work at it; otherwise
    # the subscription is rejected and nil comes back (review of 6 Nov 2026, A9).
    def branch_id
      wanted = (params[:branch_id].presence || principal[:branch_id]).to_s
      allowed = principal[:branch_ids]
      return wanted if wanted.present? && (allowed == "all" || Array(allowed).include?(wanted))
      reject
      nil
    end
  end
end
