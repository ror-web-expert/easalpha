module Api
  module V1
    class ProductsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index show barcodes analysis]
      before_action -> { require_permission!("menu.view", "menu.edit", "orders.create") }, only: %i[barcode_lookup]
      before_action -> { require_permission!("orders.create", "menu.edit") }, only: %i[add_barcode]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show barcodes barcode_lookup add_barcode analysis]
      before_action :read_only_guard!, except: %i[index show barcodes barcode_lookup analysis]

      def index
        scope = Product.where(archived_at: nil).includes(:variants, :product_prices, :product_modifier_groups, :barcodes, :tax_rate).order(:sort_order, :name)
        scope = scope.where(category_id: params[:category_id]) if params[:category_id].present?
        scope = scope.where(is_favourite: true) if params[:favourites] == "true"
        scope = scope.where(active: true) unless params[:include_inactive] == "true"
        scope = scope.where("products.name ILIKE :q OR products.sku ILIKE :q OR products.name_ur ILIKE :q OR products.id IN (SELECT product_id FROM product_barcodes WHERE code = :code)", q: "%#{params[:q]}%", code: params[:q].to_s.strip) if params[:q].present?
        rows, cursor = paginate(scope)
        costs = Catalog::Analysis.costs_for(rows)
        render_page(rows, cursor) { |p| MenuSerializers.product(p, full: true, costs: costs) }
      end

      def show
        product = Product.includes(:variants, :product_prices, :product_modifier_groups, :barcodes, :tax_rate).find(params[:id])
        render json: MenuSerializers.product(product, full: true, costs: Catalog::Analysis.costs_for([ product ]))
      end

      # GET /products/:id/analysis  Product Analysis: price, ingredient cost, profit and margin per variant and per order type
      def analysis
        product = Product.includes(:variants, :product_prices, :tax_rate).find(params[:id])
        render json: Catalog::Analysis.for_product(product, branch_id: current_branch&.id)
      end

      def create
        product = nil
        Product.transaction do
          category = Category.active.find(params.require(:category_id))
          product = Product.create!(product_params.merge(category: category, sort_order: params[:sort_order].presence || category.products.count))
          apply_nested!(product)
        end
        audit!("create", record: product, after: MenuSerializers.product(product))
        SetupChecklistItem.complete!("menu")
        render json: MenuSerializers.product(product.reload, full: true), status: :created
      end

      def update
        product = Product.find(params[:id])
        before = MenuSerializers.product(product, full: true)
        Product.transaction do
          product.update!(product_params)
          product.update!(category: Category.active.find(params[:category_id])) if params[:category_id].present?
          apply_nested!(product)
        end
        after = MenuSerializers.product(product.reload, full: true)
        action = before[:base_price_minor] != after[:base_price_minor] || before[:prices] != after[:prices] ? "price_change" : "update"
        audit!(action, record: product, before: before, after: after)
        render json: after
      end

      def destroy
        product = Product.find(params[:id])
        product.update!(archived_at: Time.current, active: false)
        product.barcodes.delete_all # an archived product frees its codes for reuse
        audit!("update", record: product, after: { archived_at: product.archived_at })
        head :no_content
      end

      def reorder
        Array(params.require(:ids)).each_with_index { |id, i| Product.where(id: id).update_all(sort_order: i) }
        head :no_content
      end

      # GET /products/:id/consumables  SPEC Order Inventory tab
      def consumables
        product = Product.find(params[:id])
        render json: { data: product.order_type_consumables.includes(:stock_item, :unit, :variant).order(:order_type).map { |c| MenuSerializers.consumable(c) } }
      end

      # PUT /products/:id/consumables  rows: [{variant_id, order_type, stock_item_id, quantity, unit_id}], copy_all_order_types
      def set_consumables
        product = Product.find(params[:id])
        rows = Array(params[:rows]).map { |r| r.permit(:variant_id, :order_type, :stock_item_id, :quantity, :unit_id).to_h }
        OrderTypeConsumable.replace!(product, rows, copy_all_order_types: ActiveModel::Type::Boolean.new.cast(params[:copy_all_order_types]))
        audit!("update", record: product, after: { consumables: rows.size })
        consumables
      end

      # GET /products/codes  SPEC Product Codes panel: every product with its SKU and PCT code
      def codes
        rows = Product.where(archived_at: nil).includes(:category).order(:name).map { |p| { id: p.id, name: p.name, category: p.category.name, sku: p.sku, pct_code: p.pct_code } }
        render json: { data: rows }
      end

      # PUT /products/codes  rows: [{id, sku, pct_code}]
      def set_codes
        rows = Array(params.require(:rows))
        Product.transaction { rows.each { |r| Product.find(r[:id]).update!(sku: r[:sku].presence, pct_code: r[:pct_code].presence) } }
        audit!("bulk_update", table_name: "products", after: { codes_updated: rows.size })
        codes
      end

      # GET /products/barcodes?q=  every barcode with its product and size, for the label printer and the codes panel
      def barcodes
        scope = ProductBarcode.joins(:product).where(products: { archived_at: nil }).includes(:product, :variant).order("products.name", :code)
        scope = scope.where("product_barcodes.code ILIKE :q OR products.name ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?
        render json: { data: scope.limit(2000).map { |b| barcode_row(b) } }
      end

      # GET /products/barcode_lookup?code=  what a scanned code adds. A 12-digit UPC-A and the same code printed as
      # EAN-13 with a leading 0 are one product. Weighing-scale labels are read by the till itself (src/lib/barcode.ts),
      # which then looks up the label's item code here.
      def barcode_lookup
        code = params.require(:code).to_s.strip
        same = [ code ]
        same << "0#{code}" if code.match?(/\A\d{12}\z/)
        same << code[1..] if code.match?(/\A0\d{12}\z/)
        scope = ProductBarcode.joins(:product).where(products: { archived_at: nil }).includes(:product, :variant)
        b = scope.find_by(code: code) || scope.find_by(code: same)
        raise Api::Errors::NotFound.new("barcode.unknown", "No product has the code #{code}") unless b
        render json: barcode_row(b).merge(product: MenuSerializers.product(b.product, full: true))
      end

      # POST /products/:id/barcodes { code, variant_id?, quantity?, approver_pin? }  attach a code, from the product
      # form or from the till when an unknown code is scanned (a cashier needs a manager PIN).
      def add_barcode
        product = Product.where(archived_at: nil).find(params[:id])
        approver = require_approval!("menu.edit")
        code = params.require(:code).to_s.strip
        if (taken = ProductBarcode.joins(:product).where(products: { archived_at: nil }).includes(:product).find_by(code: code))
          raise Api::Errors::Conflict.new("barcode.taken", "#{code} is already on #{taken.product.name}")
        end
        b = product.barcodes.create!(code: code, variant_id: params[:variant_id].presence, quantity: params[:quantity].presence || 1)
        audit!("update", record: product, approved_by: approver == current_membership ? nil : approver.user, after: { barcode_added: code, variant_id: b.variant_id, quantity: b.quantity.to_s })
        render json: { barcode: MenuSerializers.barcode(b), product: MenuSerializers.product(product.reload, full: true) }, status: :created
      end

      # DELETE /products/:id/barcodes/:barcode_id
      def remove_barcode
        product = Product.find(params[:id])
        b = product.barcodes.find(params[:barcode_id])
        b.destroy!
        product.touch
        audit!("update", record: product, after: { barcode_removed: b.code })
        head :no_content
      end

      # POST /products/barcodes/generate { count? }  free in-store EAN-13 codes (prefix 20) for items without a printed code
      def generate_barcodes
        count = params[:count].to_i.clamp(1, 200)
        render json: { codes: Catalog::Barcodes.generate(count) }
      end

      def favourite
        product = Product.find(params[:id])
        product.update!(is_favourite: ActiveModel::Type::Boolean.new.cast(params[:value]))
        render json: MenuSerializers.product(product)
      end

      private

      def barcode_row(b)
        { id: b.id, code: b.code, quantity: b.quantity.to_s, product_id: b.product_id, product_name: b.product.name, variant_id: b.variant_id, variant_name: b.variant&.name,
          price_minor: b.variant&.price_minor || b.product.base_price_minor, format: Catalog::Barcodes.format_of(b.code) }
      end

      def product_params
        params.permit(:name, :name_ur, :description, :sku, :image_key, :base_price_minor, :tax_rate_id, :is_favourite, :show_online, :active,
                      :sold_by_weight, :weight_unit, :station_id, :discount_value, :discount_type, :pct_code, allergens: [], dietary_tags: [])
      end

      # variants: [{id?, name, price_minor, sku}], prices: [{variant_id?, branch_id?, order_type, price_minor}], modifier_group_ids: [...]
      def apply_nested!(product)
        if params[:variants].is_a?(Array)
          keep = []
          params[:variants].each_with_index do |v, i|
            attrs = { name: v[:name], price_minor: v[:price_minor].to_i, sku: v[:sku].presence, sort_order: i }
            row = v[:id].present? ? product.variants.find(v[:id]).tap { |r| r.update!(attrs) } : product.variants.create!(attrs)
            keep << row.id
          end
          gone = product.variants.where.not(id: keep).pluck(:id)
          product.variants.where(id: gone).update_all(archived_at: Time.current)
          ProductBarcode.where(variant_id: gone).delete_all if gone.any?
        end
        apply_barcodes!(product) if params[:barcodes].is_a?(Array)
        if params[:prices].is_a?(Array)
          product.product_prices.delete_all
          params[:prices].each do |pr|
            product.product_prices.create!(variant_id: pr[:variant_id].presence, branch_id: pr[:branch_id].presence, order_type: pr[:order_type], price_minor: pr[:price_minor].to_i)
          end
        end
        if params[:modifier_group_ids].is_a?(Array)
          product.product_modifier_groups.delete_all
          params[:modifier_group_ids].each_with_index do |gid, i|
            product.product_modifier_groups.create!(modifier_group: ModifierGroup.active.find(gid), sort_order: i)
          end
        end
      end

      # barcodes: [{ code, variant_id? | variant_name?, quantity? }] replaces the product's codes. A new size is named
      # rather than referenced by id, since it has no id until this request creates it.
      def apply_barcodes!(product)
        rows = params[:barcodes].map { |b| b.respond_to?(:permit) ? b.permit(:code, :variant_id, :variant_name, :quantity).to_h : b.to_h }
        codes = rows.map { |r| r["code"].to_s.strip }.reject(&:blank?)
        dupes = codes.tally.select { |_, n| n > 1 }.keys
        raise Api::Errors::BadRequest.new("barcode.duplicate", "#{dupes.first} is listed twice") if dupes.any?
        taken = ProductBarcode.joins(:product).where(code: codes, products: { archived_at: nil }).where.not(product_id: product.id).includes(:product).first
        raise Api::Errors::Conflict.new("barcode.taken", "#{taken.code} is already on #{taken.product.name}") if taken
        ProductBarcode.where(code: codes).where.not(product_id: product.id).delete_all # codes left behind on archived products
        product.barcodes.delete_all
        variants = product.variants.reload
        rows.each do |r|
          code = r["code"].to_s.strip
          next if code.blank?
          variant = r["variant_id"].present? ? variants.find { |v| v.id == r["variant_id"] } : (r["variant_name"].present? ? variants.find { |v| v.name.casecmp?(r["variant_name"].to_s) } : nil)
          product.barcodes.create!(code: code, variant: variant, quantity: r["quantity"].presence || 1)
        end
        product.touch
      end
    end
  end
end
