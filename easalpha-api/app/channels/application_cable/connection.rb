module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :principal

    # The token says who is asking; the rows say whether they still may. A revoked device or a deactivated member
    # keeps no live order stream (review of 6 Nov 2026, A9). The principal also carries the branches the subscriber
    # may listen on, which the channels check.
    def connect
      token = request.params[:token].presence || request.headers["Authorization"].to_s.delete_prefix("Bearer ").presence
      claims = token && Auth::TokenService.decode(token)
      reject_unauthorized_connection unless claims && claims[:bid]
      resolved = Tenancy::Context.unscoped { resolve(claims) }
      reject_unauthorized_connection unless resolved
      self.principal = resolved
    end

    private

    def resolve(claims)
      device = claims[:did].present? && Device.find_by(id: claims[:did], business_id: claims[:bid])
      membership = claims[:mid].present? && Membership.includes(:role).find_by(id: claims[:mid], business_id: claims[:bid])
      case claims[:typ]
      when "device"
        return nil unless device&.paired?
        branch_ids = [ device.branch_id.to_s ]
      when "access"
        return nil unless membership&.active?
        return nil if claims[:did].present? && !device&.paired? # a session on a removed till goes with the till
        branch_ids = membership.all_branches ? "all" : Array(membership.branch_ids).map(&:to_s)
      else
        return nil
      end
      { business_id: claims[:bid], branch_id: claims[:brid], membership_id: membership ? membership.id : nil, device_id: device ? device.id : nil, app: claims[:app], branch_ids: branch_ids }
    end
  end
end
