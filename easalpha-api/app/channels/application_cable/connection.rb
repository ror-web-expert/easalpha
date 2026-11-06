module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :principal

    # The token says who is asking; the rows say whether they still may. The channels ask again when they subscribe
    # and every minute after (Channel#recheck_access), so a till removed in Admin or a member deactivated loses a
    # socket it already holds (final round, sync-auth#9; review of 6 Nov 2026, A9). The principal also carries the
    # branches the subscriber may listen on and the device's kind, which the channels check with the member's
    # permissions as they are at that moment.
    def connect
      token = request.params[:token].presence || request.headers["Authorization"].to_s.delete_prefix("Bearer ").presence
      claims = token && Auth::TokenService.decode(token)
      reject_unauthorized_connection unless claims && claims[:bid]
      resolved = Connection.resolve(typ: claims[:typ], business_id: claims[:bid], device_id: claims[:did], membership_id: claims[:mid], branch_id: claims[:brid], app: claims[:app])
      reject_unauthorized_connection unless resolved
      # The identifier stays short (it names the connection in the logs and the pubsub): the channels look the
      # permissions up again themselves.
      self.principal = resolved.except(:permissions)
    end

    # Who is listening, from the token's claims and the rows as they are now, or nil when they may not listen at all.
    def self.resolve(typ: nil, business_id: nil, device_id: nil, membership_id: nil, branch_id: nil, app: nil)
      Tenancy::Context.unscoped { lookup(typ.to_s, business_id, device_id, membership_id, branch_id, app) }
    end

    def self.lookup(typ, business_id, device_id, membership_id, branch_id, app)
      return nil if business_id.blank?
      device = device_id.present? ? Device.find_by(id: device_id, business_id: business_id) : nil
      membership = membership_id.present? ? Membership.includes(:role).find_by(id: membership_id, business_id: business_id) : nil
      case typ
      when "device"
        return nil unless device&.paired?
        branch_ids = [ device.branch_id.to_s ]
      when "access"
        return nil unless membership&.active?
        return nil if device_id.present? && !device&.paired? # a session on a removed till goes with the till
        branch_ids = membership.all_branches ? "all" : Array(membership.branch_ids).map(&:to_s)
      else
        return nil
      end
      { typ: typ, business_id: business_id, branch_id: branch_id, membership_id: membership&.id, device_id: device&.id, device_kind: device&.kind, app: app,
        branch_ids: branch_ids, permissions: typ == "access" ? membership.permission_codes : [] }
    end
  end
end
