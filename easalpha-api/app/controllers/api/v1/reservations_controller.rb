module Api
  module V1
    class ReservationsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("orders.create", "tables.manage", "customers.manage") }
      before_action :read_only_guard!, except: %i[index show availability]

      # GET /reservations?date=&status=&upcoming=true
      def index
        scope = Reservation.includes(:table, :customer).where(branch_id: current_branch.id).order(:starts_at)
        if params[:date].present?
          day = Date.parse(params[:date])
          zone = current_branch.time_zone
          scope = scope.where(starts_at: day.in_time_zone(zone).beginning_of_day..day.in_time_zone(zone).end_of_day)
        elsif params[:upcoming] == "true"
          scope = scope.live.where("ends_at >= ?", Time.current)
        end
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |r| serialize(r) }
      end

      def show = render(json: serialize(Reservation.includes(:table, :customer).find(params[:id])))

      def create
        r = Reservations::Manager.create!(params.permit(:table_id, :customer_id, :guest_name, :phone, :party_size, :starts_at, :ends_at, :duration_minutes, :deposit_minor, :deposit_method_code, :notes).to_h.symbolize_keys, actor: current_membership, branch: current_branch)
        audit!("create", record: r, after: { guest: r.guest_name, starts_at: r.starts_at })
        render json: serialize(r), status: :created
      end

      def update
        r = Reservation.find(params[:id])
        Reservations::Manager.update!(r, params.permit(:table_id, :guest_name, :phone, :party_size, :starts_at, :ends_at, :deposit_minor, :notes).to_h.symbolize_keys)
        render json: serialize(r)
      end

      def seat
        r = Reservation.find(params[:id])
        Reservations::Manager.seat!(r, actor: current_membership, table_id: params[:table_id], open_order: params[:open_order] != "false")
        render json: serialize(r.reload)
      end

      %w[confirmed no_show cancelled completed].each do |st|
        define_method(st == "confirmed" ? :confirm : st) do
          r = Reservation.find(params[:id])
          Reservations::Manager.mark!(r, st, actor: current_membership)
          render json: serialize(r)
        end
      end

      # GET /reservations/availability?starts_at=&ends_at=&party_size=
      def availability
        starts = Time.iso8601(params.require(:starts_at))
        ends = params[:ends_at].present? ? Time.iso8601(params[:ends_at]) : starts + 90.minutes
        tables = Reservations::Manager.availability(branch: current_branch, starts_at: starts, ends_at: ends, party_size: params[:party_size].presence&.to_i)
        render json: { starts_at: starts, ends_at: ends, tables: tables.map { |t| { id: t.id, code: t.code, name: t.name, seats: t.seats, location: t.location } } }
      end

      private

      def serialize(r)
        { id: r.id, branch_id: r.branch_id, table_id: r.table_id, table_code: r.table&.code, customer_id: r.customer_id, guest_name: r.guest_name, phone: r.phone, party_size: r.party_size, starts_at: r.starts_at, ends_at: r.ends_at,
          deposit_minor: r.deposit_minor, deposit_payment_id: r.deposit_payment_id, status: r.status, notes: r.notes, reminder_sent_at: r.reminder_sent_at, seated_at: r.seated_at, order_id: r.order_id, created_at: r.created_at }
      end
    end
  end
end
