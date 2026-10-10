module Api
  module V1
    class StockItemsController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!, except: %i[index show ledger]
      before_action -> { require_permission!("stock.view", "stock.actions", "stock.waste", "stock.count", "menu.edit") }, only: %i[index show ledger]
      before_action -> { require_permission!("stock.actions") }, except: %i[index show ledger]

      # GET /stock_items?q=&category=&low=true&packaging=true
      def index
        scope = StockItem.active.includes(:base_unit, :purchase_unit, :stock_levels).order(:name)
        scope = scope.where("stock_items.name ILIKE :q OR stock_items.sku ILIKE :q OR stock_items.barcode = :exact", q: "%#{params[:q]}%", exact: params[:q]) if params[:q].present?
        scope = scope.where(category: params[:category]) if params[:category].present?
        scope = scope.where(is_packaging: true) if params[:packaging] == "true"
        rows, cursor = paginate(scope)
        rows = rows.select(&:below_minimum?) if params[:low] == "true"
        render_page(rows, cursor) { |i| StockSerializers.item(i, levels: i.stock_levels) }
      end

      def show
        i = StockItem.includes(:base_unit, :purchase_unit, :stock_levels).find(params[:id])
        render json: StockSerializers.item(i, levels: i.stock_levels)
      end

      def create
        Unit.seed_defaults! unless Unit.exists?
        i = StockItem.create!(item_params)
        audit!("create", record: i, after: { name: i.name })
        render json: StockSerializers.item(i, levels: []), status: :created
      end

      def update
        i = StockItem.active.find(params[:id])
        before = i.attributes.slice("name", "minimum_qty", "base_unit_id")
        i.update!(item_params)
        audit!("update", record: i, before: before, after: i.attributes.slice("name", "minimum_qty", "base_unit_id"))
        render json: StockSerializers.item(i, levels: i.stock_levels)
      end

      def destroy
        i = StockItem.active.find(params[:id])
        raise Api::Errors::Conflict.new("stock.item_has_stock", "Count or adjust the item to zero before archiving it") if i.stock_levels.where.not(quantity: 0).exists?
        i.update!(archived_at: Time.current)
        head :no_content
      end

      # GET /stock_items/:id/ledger?from=&to=&kind=&section_id=
      def ledger
        scope = StockLedgerEntry.where(stock_item_id: params[:id]).includes(:stock_section, stock_item: :base_unit).order(occurred_at: :desc, created_at: :desc)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        scope = scope.where(stock_section_id: params[:section_id]) if params[:section_id].present?
        scope = scope.where(business_day: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(business_day: ..Date.parse(params[:to])) if params[:to].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |e| StockSerializers.ledger_entry(e) }
      end

      def categories
        render json: { data: StockItem.active.where.not(category: [nil, ""]).distinct.order(:category).pluck(:category) }
      end

      # POST /stock_items/import/preview  { csv }    POST /stock_items/import { csv }
      def import_preview
        render json: Stock::Import.new(params.require(:csv)).parse.preview
      end

      def import
        Unit.seed_defaults! unless Unit.exists?
        result = Stock::Import.new(params.require(:csv)).parse.apply!(branch: current_branch, actor: current_membership)
        audit!("import", table_name: "stock_items", after: result)
        render json: result
      end

      private

      def item_params
        params.permit(:name, :name_ur, :sku, :category, :base_unit_id, :purchase_unit_id, :minimum_qty, :reorder_qty, :track_expiry, :barcode, :is_packaging)
      end
    end
  end
end
