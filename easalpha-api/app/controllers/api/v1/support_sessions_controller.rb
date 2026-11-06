module Api
  module V1
    # Support access: EasAlpha staff ask, the owner approves, access lasts an hour and every action is logged.
    class SupportSessionsController < BaseController
      before_action :authenticate!, only: %i[index approve deny end_session]
      before_action :refuse_support!, only: %i[approve deny end_session] # support never approves its own access
      before_action :authenticate_super!, only: %i[request_access token]

      def index
        require_permission!("settings.manage")
        render json: { data: SupportSession.order(created_at: :desc).limit(20).map { |s| serialize(s) } }
      end

      def approve
        require_permission!("settings.manage")
        s = SupportSession.find(params[:id])
        s.update!(status: "approved", approved_by_membership_id: current_membership.id, approved_at: Time.current, expires_at: 1.hour.from_now)
        audit!("approve", record: s, after: { approved: true })
        render json: serialize(s)
      end

      def deny
        require_permission!("settings.manage")
        s = SupportSession.find(params[:id])
        s.update!(status: "denied")
        render json: serialize(s)
      end

      # POST /super/support_sessions  business_id, reason
      def request_access
        business = Business.find(params.require(:business_id))
        s = Tenancy::Context.with(business) do
          sess = SupportSession.create!(business: business, super_admin_id: @super_admin.id, reason: params.require(:reason))
          Notification.create!(kind: "support_request", title: "EasAlpha support asks for access", body: sess.reason, link: "/settings/support")
          sess
        end
        render json: serialize(s), status: :created
      end

      # POST /super/support_sessions/:id/token  -> a support access token for the approved window
      # Only the super admin who asked, the one the owner approved, may open it; any other super admin could before
      # (review of 6 Nov 2026, R10). The token acts as the owner but is marked as support and ends with the session.
      def token
        s = SupportSession.unscoped.find(params[:id])
        raise Api::Errors::Forbidden.new("support.not_yours", "This support session was asked for, and approved, for another EasAlpha admin") unless s.super_admin_id == @super_admin.id
        raise Api::Errors::Forbidden.new("support.not_approved", "The owner has not approved this session") unless s.active?
        Tenancy::Context.with(s.business) do
          owner = Membership.active.joins(:role).where(roles: { system_key: "owner" }).includes(:user).first
          Current.support_session = s
          AuditLog.record(action: "login", record: s, after: { support_login: @super_admin.email }, business: s.business)
          render json: { access_token: Auth::TokenService.support_token(support_session: s, membership: owner), expires_at: s.expires_at, business: Serializers.business(s.business),
                         support: support_info(s) }
        end
      end

      # POST /support_sessions/:id/end  the owner closes an approved session before its hour is up; its token stops at once.
      def end_session
        require_permission!("settings.manage")
        s = SupportSession.find(params[:id])
        s.update!(status: "ended", ended_at: Time.current) if s.status == "approved" && s.ended_at.nil?
        audit!("update", record: s, after: { ended: true })
        render json: serialize(s)
      end

      private

      def serialize(s)
        { id: s.id, super_admin_id: s.super_admin_id, reason: s.reason, status: s.status, approved_at: s.approved_at, expires_at: s.expires_at, ended_at: s.ended_at, created_at: s.created_at, active: s.active? }
      end
    end
  end
end
