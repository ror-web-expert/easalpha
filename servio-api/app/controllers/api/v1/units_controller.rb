module Api
  module V1
    class UnitsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.actions", "settings.manage") }, except: :index

      def index
        require_permission!("stock.view", "stock.actions", "stock.waste", "stock.count", "menu.edit")
        Unit.seed_defaults! unless Unit.exists?
        render json: { data: Unit.active.order(:kind, :factor_to_base).map { |u| StockSerializers.unit(u) } }
      end

      def create
        u = Unit.create!(params.permit(:code, :name, :kind, :factor_to_base))
        render json: StockSerializers.unit(u), status: :created
      end

      def update
        u = Unit.active.find(params[:id])
        u.update!(params.permit(:name, :factor_to_base))
        render json: StockSerializers.unit(u)
      end

      # GET /unit_conversions  SPEC: every stored factor, each direction its own row
      def conversions
        require_permission!("stock.view", "stock.actions", "stock.waste", "stock.count", "menu.edit")
        UnitConversion.seed_defaults!
        render json: { data: UnitConversion.includes(:from_unit, :to_unit).order(:created_at).map { |c| StockSerializers.unit_conversion(c) } }
      end

      # POST /unit_conversions  from_unit_id, to_unit_id, factor  (writes both directions)
      def set_conversion
        from = Unit.active.find(params.require(:from_unit_id))
        to = Unit.active.find(params.require(:to_unit_id))
        rows = UnitConversion.set!(from: from, to: to, factor: params.require(:factor))
        audit!("update", table_name: "unit_conversions", record_id: rows.first.id, after: { from: from.code, to: to.code, factor: params[:factor] })
        render json: { data: rows.map { |c| StockSerializers.unit_conversion(c.reload) } }
      end

      def destroy
        u = Unit.active.find(params[:id])
        raise Api::Errors::Conflict.new("unit.in_use", "Unit is used by stock items") if StockItem.active.where(base_unit_id: u.id).or(StockItem.active.where(purchase_unit_id: u.id)).exists?
        u.update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end
