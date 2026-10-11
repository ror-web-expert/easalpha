require "csv"

# Imports a menu from EasAlpha JSON, the ArfaPOS JSON export, or a CSV with columns
# category, name, price, sku, description, name_ur. Preview first, then apply.
class MenuImport
  Row = Struct.new(:line, :category, :name, :name_ur, :price_minor, :sku, :description, :image, :error, keyword_init: true)

  attr_reader :rows, :errors

  def initialize(source:, data:, menu: nil)
    @source, @data, @menu = source, data, menu
    @rows, @errors = [], []
  end

  def parse
    case @source
    when "csv" then parse_csv
    when "arfapos_json", "easalpha_json" then parse_json
    else raise ArgumentError, "unknown import source #{@source}"
    end
    self
  end

  def preview
    { source: @source, rows: rows.first(500).map(&:to_h), row_count: rows.size, valid_count: rows.count { |r| r.error.nil? },
      error_rows: rows.select(&:error).map { |r| { line: r.line, error: r.error, name: r.name } }, categories: rows.map(&:category).compact.uniq }
  end

  # Creates categories and products under the menu. Existing products are matched by SKU, then by name within the category, and updated.
  def apply!(menu)
    created = updated = 0
    Product.transaction do
      rows.reject(&:error).each do |r|
        category = Category.active.find_by(menu_id: menu.id, name: r.category) || Category.create!(menu: menu, name: r.category)
        product = (r.sku && Product.where(archived_at: nil).find_by(sku: r.sku)) || Product.where(archived_at: nil, category_id: category.id).find_by(name: r.name)
        attrs = { category: category, name: r.name, name_ur: r.name_ur, base_price_minor: r.price_minor, sku: r.sku, description: r.description }.compact
        if product
          product.update!(attrs)
          updated += 1
        else
          Product.create!(attrs)
          created += 1
        end
      end
    end
    { created: created, updated: updated, skipped: rows.count(&:error) }
  end

  private

  def parse_csv
    CSV.parse(@data.to_s, headers: true, header_converters: ->(h) { h.to_s.strip.downcase.tr(" ", "_") }).each_with_index do |row, i|
      add_row(line: i + 2, category: row["category"], name: row["name"] || row["product"], name_ur: row["name_ur"], price: row["price"], sku: row["sku"], description: row["description"], image: row["image"])
    end
  rescue CSV::MalformedCSVError => e
    @errors << "CSV could not be read: #{e.message}"
  end

  def parse_json
    doc = @data.is_a?(String) ? JSON.parse(@data) : @data
    doc = doc.deep_stringify_keys if doc.respond_to?(:deep_stringify_keys)
    line = 0
    menus = doc["menus"] || [ doc ]
    menus.each do |m|
      categories = m["categories"] || []
      categories.each do |c|
        cname = c["name"] || c["category"]
        (c["products"] || c["items"] || []).each do |p|
          line += 1
          add_row(line: line, category: cname, name: p["name"], name_ur: p["name_ur"] || p["urdu_name"], price: p["price"] || p["base_price"] || p["selling_price"],
                  sku: p["sku"] || p["code"], description: p["description"], image: p["image"] || p["image_url"])
        end
      end
      (m["products"] || []).each do |p|
        line += 1
        add_row(line: line, category: p["category"] || p["category_name"], name: p["name"], name_ur: p["name_ur"], price: p["price"] || p["base_price"],
                sku: p["sku"] || p["code"], description: p["description"], image: p["image"])
      end
    end
  rescue JSON::ParserError => e
    @errors << "JSON could not be read: #{e.message}"
  end

  def add_row(line:, category:, name:, price:, name_ur: nil, sku: nil, description: nil, image: nil)
    r = Row.new(line: line, category: category.to_s.strip.presence, name: name.to_s.strip.presence, name_ur: name_ur.to_s.strip.presence,
                sku: sku.to_s.strip.presence, description: description.to_s.strip.presence, image: image.to_s.strip.presence)
    r.price_minor = parse_price(price)
    r.error = "category is missing" if r.category.nil?
    r.error = "name is missing" if r.name.nil?
    r.error = "price is not a number" if r.price_minor.nil?
    @rows << r
  end

  def parse_price(v)
    return nil if v.nil?
    s = v.to_s.gsub(/[^\d.]/, "")
    return nil if s.blank?
    (BigDecimal(s) * 100).round
  rescue ArgumentError
    nil
  end
end
