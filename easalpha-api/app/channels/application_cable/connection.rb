module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :principal

    def connect
      token = request.params[:token].presence || request.headers["Authorization"].to_s.delete_prefix("Bearer ").presence
      claims = token && Auth::TokenService.decode(token)
      reject_unauthorized_connection unless claims && claims[:bid]
      self.principal = { business_id: claims[:bid], branch_id: claims[:brid], membership_id: claims[:mid], device_id: claims[:did], app: claims[:app] }
    end
  end
end
