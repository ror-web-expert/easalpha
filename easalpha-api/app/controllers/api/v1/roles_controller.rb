module Api
  module V1
    class RolesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage") }, except: [ :index, :show, :permissions, :presets ]

      def index
        render json: { data: Role.active.includes(:role_permissions).order(:created_at).map { |r| Serializers.role(r) } }
      end

      def show
        render json: Serializers.role(Role.includes(:role_permissions).find(params[:id]))
      end

      # The full registry: SPEC codes with module, surface and restriction, then the EasAlpha extras.
      def permissions
        render json: { data: Permission::REGISTRY.values.map(&:to_h), modules: Permission::MODULES + [ Permission::EASALPHA_MODULE ] }
      end

      def presets
        render json: { data: PermissionPreset.list }
      end

      # POST /roles  name, copy_from_role_id
      def create
        read_only_guard!
        source = Role.active.find(params.require(:copy_from_role_id))
        role = source.copy!(name: params.require(:name))
        audit!("create", record: role, after: { copied_from: source.name })
        render json: Serializers.role(role.reload), status: :created
      end

      # PUT /roles/:id  name?, permissions: [{code, limit}]
      def update
        read_only_guard!
        role = Role.active.find(params[:id])
        before = Serializers.role(role)
        role.update!(name: params[:name]) if params[:name].present? && !role.is_system
        if params[:permissions].is_a?(Array)
          map = params[:permissions].to_h { |p| [ p[:code].to_s, p[:limit].presence&.to_d ] }
          guard_escalation!(map.keys)
          role.set_permissions!(map)
        end
        audit!("permission_change", record: role, before: before, after: Serializers.role(role.reload))
        render json: Serializers.role(role)
      end

      def destroy
        role = Role.active.find(params[:id])
        raise Api::Errors::Conflict.new("role.system", "System roles cannot be deleted") if role.is_system
        raise Api::Errors::Conflict.new("role.in_use", "Move members to another role first") if Membership.active.where(role_id: role.id).exists?
        role.update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end
