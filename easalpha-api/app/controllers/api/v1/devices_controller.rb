module Api
  module V1
    class DevicesController < BaseController
      before_action :authenticate!, only: [ :index, :create, :register, :update, :regenerate_code, :destroy ]
      before_action -> { require_permission!("devices.manage") }, only: [ :create, :register, :update, :regenerate_code, :destroy ]

      def index
        scope = Device.includes(:branch).order(:created_at)
        scope = scope.where(branch_id: params[:branch_id]) if params[:branch_id].present?
        render json: { data: scope.map { |d| Serializers.device(d, include_code: current_membership.can?("devices.manage")) } }
      end

      # POST /devices  name, branch_id, kind  -> pairing code shown once
      def create
        read_only_guard!
        device = build_device!
        device.issue_pairing_code!
        render json: Serializers.device(device, include_code: true), status: :created
      end

      # POST /devices/register  name, branch_id, kind, platform, app_version, [station_id]
      # "Set up this device": an owner or manager signs in on the machine itself, picks what it is, and the machine is
      # created and paired in one step. The response is the same as /devices/pair, plus the staff who can sign in on it
      # (so the manager can see who still needs a PIN). No pairing code is ever shown; the manager's login is not kept.
      def register
        read_only_guard!
        device = build_device!
        device.update!(paired_at: Time.current, platform: params[:platform], app_version: params[:app_version], last_seen_at: Time.current)
        audit!("pair_device", record: device, after: { platform: params[:platform], via: "setup" })
        SetupChecklistItem.complete!("printer")
        render json: pair_payload(device).merge(staff: staff_for(device)), status: :created
      end

      def update
        device = Device.find(params[:id])
        device.update!(params.permit(:name, :station_id))
        render json: Serializers.device(device, include_code: true)
      end

      def regenerate_code
        device = Device.find(params[:id])
        raise Api::Errors::Conflict.new("device.revoked", "Revoked devices cannot be paired") if device.revoked_at
        device.issue_pairing_code!
        render json: Serializers.device(device, include_code: true)
      end

      def destroy
        device = Device.find(params[:id])
        device.revoke!
        RefreshToken.where(device_id: device.id).update_all(revoked_at: Time.current)
        audit!("revoke_device", record: device)
        head :no_content
      end

      # POST /devices/pair  pairing_code, platform, app_version   (public)
      def pair
        device = Device.unscoped.find_by(pairing_code: params.require(:pairing_code).to_s, revoked_at: nil)
        raise Api::Errors::Unauthorized.new("pairing.invalid", "Pairing code is wrong or expired") unless device && device.pairing_expires_at && device.pairing_expires_at > Time.current
        Tenancy::Context.with(device.business, branch: device.branch, device: device) do
          device.update!(paired_at: Time.current, pairing_code: nil, pairing_expires_at: nil, platform: params[:platform], app_version: params[:app_version], last_seen_at: Time.current)
          AuditLog.record(action: "pair_device", record: device, after: { platform: params[:platform] })
          SetupChecklistItem.complete!("printer")
          render json: pair_payload(device)
        end
      end

      # POST /devices/pin_login  pin   (device token)
      def pin_login
        authenticate_device!
        pin = params.require(:pin).to_s
        throttle = "device:#{current_device.id}"
        Auth::PinThrottle.check!(throttle)
        candidates = Membership.active.includes(:role, :user).where.not(pin_digest: nil).select { |m| m.branch_allowed?(current_device.branch_id) }
        app = current_device.app # kitchen, rider (SPEC rider app: the rider's phone is a paired device) or pos
        # Two people may share a PIN by accident; prefer the one who may use this device's app.
        matches = candidates.select { |m| m.pin_digest && BCrypt::Password.new(m.pin_digest) == pin && !m.pin_locked? }
        membership = matches.find { |m| m.can?("app.#{app}") } || matches.first
        unless membership
          # Nobody is named by a wrong PIN, so the till that typed it takes the strike, not every member with a PIN.
          Auth::PinThrottle.failed!(throttle)
          AuditLog.record(action: "pin_failed", after: { device: current_device.code })
          raise Api::Errors::Unauthorized.new("pin.invalid", "Wrong PIN")
        end
        raise Api::Errors::Forbidden.new("app.denied", "You don't have access to this app") unless membership.can?("app.#{app}")
        Auth::PinThrottle.clear!(throttle)
        membership.update_columns(pin_failed_count: 0, pin_locked_until: nil)
        current_device.update_columns(last_seen_at: Time.current)
        Current.user = membership.user
        Current.membership = membership
        AuditLog.record(action: "pin_login", after: { device: current_device.code })
        render json: Auth::SessionIssuer.issue(user: membership.user, membership: membership, app: app, device: current_device, branch: current_device.branch, request: request)
      end

      # POST /devices/heartbeat  app_version, pending_sync   (device or access token)
      def heartbeat
        raise Api::Errors::Unauthorized unless current_device
        current_device.update_columns(last_seen_at: Time.current, app_version: params[:app_version].presence || current_device.app_version)
        render json: { ok: true, server_time: Time.current, business_status: current_business.status, read_only: current_business.read_only? }
      end

      private

      def build_device!
        branch = Branch.active.find(params[:branch_id].presence || current_branch.id)
        kind = params[:kind].presence || "till"
        if kind.in?(%w[till tablet])
          limit = current_business.plan_limit("tills")
          raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} till(s). Add a till to your plan.") if limit && Device.active.where(kind: %w[till tablet]).count >= limit
        end
        device = Device.create!(branch: branch, name: params.require(:name), kind: kind, station_id: params[:station_id].presence)
        audit!("create", record: device, after: { name: device.name, branch_id: branch.id, kind: kind })
        device
      end

      def pair_payload(device)
        { device_token: Auth::TokenService.device_token(device), device: Serializers.device(device),
          business: Serializers.business(device.business), branch: Serializers.branch(device.branch) }
      end

      # Who can sign in on this device: active, allowed at its branch, and holding the app permission its kind needs.
      # Screens without a login (token, queue, customer display) list nobody.
      def staff_for(device)
        return [] unless device.kind.in?(%w[till tablet kitchen rider])
        Membership.active.includes(:role, :user).select { |m| m.branch_allowed?(device.branch_id) && m.can?("app.#{device.app}") }
                  .map { |m| { id: m.id, name: m.user&.name, role: m.role.name, staff_type: m.staff_type, has_pin: m.pin_digest.present?, pin_locked: m.pin_locked? } }
      end
    end
  end
end
