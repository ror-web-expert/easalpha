module Api
  module V1
    # Help and Support box: any signed-in staff member can write to EasAlpha; managers see every request of the business,
    # others only their own.
    class SupportRequestsController < BaseController
      before_action :authenticate!

      def index
        scope = SupportRequest.open_first.includes(:membership)
        scope = scope.where(membership_id: current_membership.id) unless current_membership.can?("settings.manage")
        render json: { data: scope.limit(50).map { |r| serialize(r) } }
      end

      def create
        read_only_guard!
        r = SupportRequest.create!(params.permit(:subject, :message, :category, :page).merge(membership_id: current_membership.id, branch_id: current_branch&.id))
        audit!("create", record: r, after: { subject: r.subject, category: r.category })
        render json: serialize(r), status: :created
      end

      private

      def serialize(r)
        { id: r.id, subject: r.subject, message: r.message, category: r.category, status: r.status, page: r.page,
          reply: r.reply, replied_at: r.replied_at, closed_at: r.closed_at, created_at: r.created_at,
          by: r.membership && { id: r.membership.id, name: r.membership.user&.name } }
      end
    end
  end
end
