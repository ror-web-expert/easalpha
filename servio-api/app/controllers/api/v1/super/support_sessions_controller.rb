module Api
  module V1
    module Super
      # Every support-access request across businesses, for the super panel's inbox.
      class SupportSessionsController < BaseController
        before_action :authenticate_super!

        def index
          rows = SupportSession.includes(:business).order(created_at: :desc).limit(100)
          render json: { data: rows.map { |s| { id: s.id, business: { id: s.business.id, name: s.business.name }, super_admin_id: s.super_admin_id, reason: s.reason, status: s.status, approved_at: s.approved_at, expires_at: s.expires_at, active: s.active?, created_at: s.created_at } } }
        end
      end
    end
  end
end
