module Api
  module V1
    # Export the whole menu as JSON, or import one from JSON or CSV with a preview step.
    class MenuTransferController < BaseController
      before_action -> { require_permission!("menu.edit") }
      before_action :read_only_guard!, only: %i[import_preview import_apply]

      def export
        menus = Menu.active.includes(categories: { products: %i[variants product_prices product_modifier_groups] })
        render json: {
          format: "servio_json", version: 1, exported_at: Time.current, business: current_business.name,
          tax_rates: TaxRate.all.map { |t| MenuSerializers.tax_rate(t) },
          modifier_groups: ModifierGroup.active.includes(:modifiers).map { |g| MenuSerializers.modifier_group(g) },
          menus: menus.map { |m| MenuSerializers.menu(m).merge(categories: m.categories.map { |c| MenuSerializers.category(c).merge(products: c.products.map { |p| MenuSerializers.product(p, full: true) }) }) },
          deals: Deal.active.includes(:deal_items).map { |d| MenuSerializers.deal(d) },
          promotions: Promotion.active.map { |p| MenuSerializers.promotion(p) }
        }
      end

      # POST /menu/import/preview  source (csv|arfapos_json|servio_json), data (string or object)
      def import_preview
        importer = MenuImport.new(source: params.require(:source), data: params[:data]).parse
        job = ImportJob.create!(kind: "menu", source: params[:source] == "servio_json" ? "arfapos_json" : params[:source], status: "previewed",
                                row_count: importer.rows.size, preview: { rows: importer.rows.map(&:to_h) }, error_rows: importer.preview[:error_rows], by_user_id: current_user.id)
        render json: importer.preview.merge(import_job_id: job.id, parse_errors: importer.errors)
      end

      # POST /menu/import/apply  import_job_id, menu_id
      def import_apply
        job = ImportJob.find(params.require(:import_job_id))
        raise Api::Errors::Conflict.new("import.applied", "This import was already applied") if job.status == "applied"
        menu = params[:menu_id].present? ? Menu.active.find(params[:menu_id]) : (Menu.active.find_by(is_default: true) || Menu.active.first || Menu.create!(name: "Main menu", is_default: true))
        importer = MenuImport.new(source: "servio_json", data: { "products" => job.preview["rows"].reject { |r| r["error"] }.map { |r| { "name" => r["name"], "category" => r["category"], "price" => r["price_minor"].to_i / 100.0, "sku" => r["sku"], "name_ur" => r["name_ur"], "description" => r["description"] } } }).parse
        result = importer.apply!(menu).merge(skipped: job.error_rows.size)
        job.update!(status: "applied")
        audit!("create", record: job, after: result)
        SetupChecklistItem.complete!("menu")
        render json: result.merge(menu_id: menu.id)
      end
    end
  end
end
