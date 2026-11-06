require "csv"

# CSV for files people open in Excel or Google Sheets. A text cell that starts with = + - @, a tab or a carriage
# return is written with a leading apostrophe, so the spreadsheet shows it as text instead of running it as a formula
# (CSV injection: a customer named "=HYPERLINK(...)" must not become a link in the owner's export). Numbers, dates and
# blanks are written as they are, so negative amounts stay numbers.
module SafeCsv
  FORMULA = /\A[=+\-@\t\r]/
  CONVERTER = ->(field) { field.is_a?(String) && field.match?(FORMULA) ? "'#{field}" : field }

  # Reading back one of these files (an export re-imported): the apostrophe in front of = + - @ is dropped again.
  UNESCAPE = ->(field) { field.is_a?(String) && field.match?(/\A'[=+\-@\t\r]/) ? field[1..] : field }

  module_function

  def generate(**options, &block) = CSV.generate(**options, write_converters: [ CONVERTER ], &block)

  # A file that is not valid CSV (a quote left open, a quote inside a field) is the sender's to fix: 400 import.csv
  # with the line the parser stopped at, where the customer, supplier and stock imports answered 500 (the menu
  # import's preview lists it among its parse errors).
  def parse(data, **options, &block)
    CSV.parse(data, **options, converters: [ UNESCAPE ], &block)
  rescue CSV::MalformedCSVError => e
    raise Api::Errors::BadRequest.new("import.csv", "The file could not be read as CSV: #{e.message}", details: { line: e.line_number })
  end
end
