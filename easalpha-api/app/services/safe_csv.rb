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

  def parse(data, **options, &block) = CSV.parse(data, **options, converters: [ UNESCAPE ], &block)
end
