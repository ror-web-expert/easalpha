module Api
  module V1
    class CampaignsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("customers.manage", "settings.manage") }
      before_action :read_only_guard!, except: %i[index show audience stats]

      def index
        rows, cursor = paginate(Campaign.includes(:promotion).order(created_at: :desc))
        render_page(rows, cursor) { |c| serialize(c) }
      end

      def show = render(json: serialize(Campaign.find(params[:id])).merge(stats: Campaigns::Sender.stats(Campaign.find(params[:id]))))

      # POST /campaigns { name, body, segment: {kind, group_id, days, month, limit}, promotion_id, scheduled_at, send_now }
      def create
        c = Campaign.create!(campaign_params.merge(created_by_membership_id: current_membership.id, status: params[:scheduled_at].present? ? "scheduled" : "draft"))
        c.update!(audience_count: Campaigns::Segments.audience(c.segment)[:reachable])
        send_or_schedule(c) if ActiveModel::Type::Boolean.new.cast(params[:send_now])
        render json: serialize(c.reload), status: :created
      end

      def update
        c = Campaign.find(params[:id])
        raise Api::Errors::Conflict.new("campaign.status", "Campaign is #{c.status}") unless c.editable?
        c.update!(campaign_params.merge(status: params[:scheduled_at].present? ? "scheduled" : "draft"))
        render json: serialize(c)
      end

      def destroy
        c = Campaign.find(params[:id])
        c.status.in?(%w[draft scheduled]) ? c.destroy! : c.update!(status: "cancelled")
        head :no_content
      end

      # GET /campaigns/audience?kind=&group_id=&days=&month=&limit=
      def audience = render(json: Campaigns::Segments.audience(params.permit(:kind, :group_id, :days, :month, :limit).to_h))

      def send_now
        c = Campaign.find(params[:id])
        raise Api::Errors::Conflict.new("campaign.status", "Campaign is #{c.status}") unless c.status.in?(%w[draft scheduled])
        Campaigns::Sender.send!(c)
        audit!("campaign_send", record: c, after: { sent: c.sent_count, skipped: c.skipped_count })
        render json: serialize(c.reload).merge(stats: Campaigns::Sender.stats(c))
      end

      def stats = render(json: Campaigns::Sender.stats(Campaign.find(params[:id])))

      private

      def send_or_schedule(c)
        c.scheduled_at.present? && c.scheduled_at > Time.current ? c.update!(status: "scheduled") : Campaigns::Sender.send!(c)
      end

      def campaign_params
        h = params.permit(:name, :body, :promotion_id, :scheduled_at, segment: {}).to_h.symbolize_keys
        h[:segment] = (h[:segment] || {}).to_h.stringify_keys
        h[:segment]["kind"] ||= "all"
        h
      end

      def serialize(c)
        { id: c.id, name: c.name, body: c.body, segment: c.segment, promotion_id: c.promotion_id, coupon_code: c.promotion&.coupon_code, status: c.status, scheduled_at: c.scheduled_at, started_at: c.started_at,
          finished_at: c.finished_at, audience_count: c.audience_count, sent_count: c.sent_count, skipped_count: c.skipped_count, created_at: c.created_at }
      end
    end
  end
end
