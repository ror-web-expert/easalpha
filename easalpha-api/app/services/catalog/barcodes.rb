module Catalog
  # Barcode helpers: the format a code is printed in, EAN check digits, and free in-store codes for items that come
  # without one. In-store codes use the GS1 restricted prefix 20, which scales (21 to 29) and suppliers never print.
  module Barcodes
    module_function

    def ean_check_digit(digits)
      sum = digits.to_s.reverse.chars.each_with_index.sum { |d, i| d.to_i * (i.even? ? 3 : 1) }
      (10 - sum % 10) % 10
    end

    def valid_ean?(code)
      c = code.to_s
      return false unless c.match?(/\A\d+\z/) && [ 8, 12, 13 ].include?(c.length)
      ean_check_digit(c[0..-2]) == c[-1].to_i
    end

    def format_of(code)
      c = code.to_s
      return "ean13" if c.length == 13 && valid_ean?(c)
      return "upca" if c.length == 12 && valid_ean?(c)
      return "ean8" if c.length == 8 && valid_ean?(c)
      return "qr" if c.length > 40 || c.match?(%r{\A\w+://}) || c.match?(/[^\x20-\x7E]/)
      "code128"
    end

    def generate(count)
      taken = ProductBarcode.where("code LIKE '20%'").pluck(:code).to_set
      taken.merge(StockItem.where("barcode LIKE '20%'").pluck(:barcode)) if StockItem.column_names.include?("barcode")
      codes = []
      attempts = 0
      while codes.size < count && attempts < count * 50
        attempts += 1
        body = "20#{format('%010d', SecureRandom.random_number(10**10))}"
        code = "#{body}#{ean_check_digit(body)}"
        next if taken.include?(code) || codes.include?(code)
        codes << code
      end
      codes
    end
  end
end
