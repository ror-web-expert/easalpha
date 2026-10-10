module Api
  module V1
    class BaseController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      around_action :tenant_scope
      before_action :set_request_context

      rescue_from Api::Errors::ApiError, with: :render_api_error
      rescue_from ActiveRecord::RecordNotFound do |_e| render_error("not_found", "Not found", 404) end
      rescue_from ActiveRecord::RecordInvalid do |e| render_error("validation_failed", e.record.errors.full_messages.to_sentence, 422, e.record.errors.to_hash) end
      rescue_from ActionController::ParameterMissing do |e| render_error("missing_parameter", e.message, 400) end
      rescue_from ArgumentError do |e| render_error("bad_request", e.message, 400) end
      rescue_from Tenanted::NoTenantError do |e| render_error("no_tenant", e.message, 500) end

      private

      # Every request runs either inside a business (after a valid token) or unscoped (public and platform endpoints).
      def tenant_scope
        Tenancy::Context.unscoped do
          @claims = decode_token
          load_principal_from_claims if @claims
          if @business
            Tenancy::Context.with(@business, branch: @branch, user: @user, membership: @membership, device: @device, app: @claims[:app]) do
              Current.ip = request.remote_ip
              Current.request_id = request.request_id
              yield
            end
          else
            Current.ip = request.remote_ip
            yield
          end
        end
      end

      def set_request_context
        response.set_header("X-Request-Id", request.request_id)
      end

      def decode_token
        header = request.authorization.to_s
        return nil unless header.start_with?("Bearer ")
        Auth::TokenService.decode(header.delete_prefix("Bearer ").strip)
      end

      def load_principal_from_claims
        case @claims[:typ]
        when "access"
          @membership = Membership.includes(:role, :user, :business).find_by(id: @claims[:mid])
          raise Api::Errors::Unauthorized.new("session.invalid", "Session is no longer valid") unless @membership&.active?
          @user = @membership.user
          @business = @membership.business
          @membership.permission_codes = Array(@claims[:perms]).map(&:to_s) if @claims[:perms].is_a?(Array)
          raise Api::Errors::Unauthorized.new("business.deleted", "This business was deleted") if @business.status == "deleted"
          @device = @claims[:did] && Device.find_by(id: @claims[:did])
          raise Api::Errors::Unauthorized.new("device.revoked", "This device was removed") if @claims[:did] && (@device.nil? || @device.revoked_at)
          @branch = resolve_branch
        when "device"
          @device = Device.find_by(id: @claims[:did])
          raise Api::Errors::Unauthorized.new("device.revoked", "This device was removed") unless @device&.paired?
          @business = @device.business
          @branch = @device.branch
        when "super"
          @super_admin = SuperAdmin.find_by(id: @claims[:sub])
        end
      end

      def resolve_branch
        wanted = request.headers["X-Branch-Id"].presence || @claims[:brid].presence
        branches = Branch.unscoped.where(business_id: @business.id, archived_at: nil)
        branch = wanted ? branches.find_by(id: wanted) : nil
        branch ||= @device&.branch || branches.find_by(is_main: true) || branches.first
        raise Api::Errors::Forbidden.new("branch.not_allowed", "You cannot work at this branch") if branch && !@membership.branch_allowed?(branch.id)
        branch
      end

      # --- guards -------------------------------------------------------------------------

      def authenticate!
        raise Api::Errors::Unauthorized unless @membership&.active?
      end

      def authenticate_device!
        raise Api::Errors::Unauthorized.new("device.required", "A paired device is required") unless @device&.paired?
      end

      def authenticate_super!
        raise Api::Errors::Unauthorized.new("super.required", "Super admin login required") unless @super_admin
      end

      def require_permission!(*codes)
        authenticate!
        return if codes.any? { |c| @membership.can?(c, surface: current_surface) }
        raise Api::Errors::Forbidden.new("permission.denied", "Missing permission: #{codes.join(' or ')}")
      end

      # SPEC surface: the desktop POS is "software", a device paired as a tablet is "app"; the admin panel ignores it.
      def current_surface
        return nil unless @claims && @claims[:app].to_s == "pos"
        @device&.kind == "tablet" ? "app" : "software"
      end

      def require_app!(app)
        raise Api::Errors::Forbidden.new("app.denied", "You don't have access to this app") unless @membership&.can?("app.#{app}")
      end

      def read_only_guard!
        raise Api::Errors::ReadOnly if @business&.read_only? && !request.get?
      end

      def current_membership = @membership
      def current_user = @user
      def current_business = @business
      def current_branch = @branch
      def current_device = @device
      def current_shift = @membership && Shift.open.find_by(cashier_membership_id: @membership.id)

      # from..to from the query, defaulting to the current month (shared by the money and report controllers).
      def range
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        from..to
      rescue Date::Error
        raise Api::Errors::BadRequest.new("report.range", "Dates must be YYYY-MM-DD")
      end

      def day_lock_guard!(day)
        raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if day && DayClose.locked?(current_branch.id, day)
      end

      # Manager approval by PIN for a sensitive action. Returns the approving membership.
      def require_approval!(permission, pin: params[:approver_pin])
        return current_membership if current_membership.can?(permission)
        approver = Auth::PinApproval.find_approver(pin: pin, permission: permission, exclude_membership: current_membership)
        raise Api::Errors::Forbidden.new("approval.required", "A manager PIN is required for this action") unless approver
        approver
      end

      # --- responses ----------------------------------------------------------------------

      # Messages come back in Urdu when the client sends Accept-Language: ur (or X-Locale: ur); unknown codes keep the English text.
      def render_error(code, message, status, details = nil)
        render json: { error: { code: code, message: localized_message(code, message), details: details }.compact }, status: status
      end

      def localized_message(code, message)
        return message if request_locale == :en
        I18n.t("errors", locale: request_locale, default: {}).fetch(code.to_s.to_sym, message)
      end

      def request_locale
        @request_locale ||= begin
          raw = request.headers["X-Locale"].presence || request.headers["Accept-Language"].to_s.split(",").first.to_s
          raw.to_s.downcase.start_with?("ur") ? :ur : :en
        end
      end

      def render_api_error(e) = render_error(e.code, e.message, e.status, e.details)

      def render_page(rows, next_cursor, &serializer)
        render json: { data: rows.map(&serializer), next_cursor: next_cursor }
      end

      def paginate(scope)
        Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
      end

      def audit!(action, record: nil, before: nil, after: nil, approved_by: nil, table_name: nil, record_id: nil)
        AuditLog.record(action: action, record: record, before: before, after: after, approved_by: approved_by, table_name: table_name, record_id: record_id)
      end
    end
  end
end
