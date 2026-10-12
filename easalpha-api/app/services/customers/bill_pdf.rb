require "prawn"
require "prawn/table"

module Customers
  # The customer bill as an A4 PDF: business header, customer box, period summary, every entry with a running balance,
  # the amount due and the due date. Several bills render into one document, one customer per page (Print all bills).
  class BillPdf
    FONT_DIR = Rails.root.join("vendor/fonts")
    NAVY = "0B1F3A".freeze
    ORANGE = "FF7A1A".freeze
    MUTED = "5F6B7A".freeze
    LINE = "D9DEE5".freeze

    KIND_LABEL = { "charge" => "Purchase", "payment" => "Payment", "refund" => "Refund", "paid_out" => "Paid to customer",
                   "opening" => "Opening balance", "adjustment" => "Adjustment", "reversal" => "Reversal" }.freeze

    def self.render(bills) = new(Array(bills)).render

    def initialize(bills)
      @bills = bills
    end

    def render
      pdf = Prawn::Document.new(page_size: "A4", margin: [ 36, 36, 48, 36 ], info: { Title: @bills.size == 1 ? @bills.first[:number] : "Customer bills", Creator: "EasAlpha" })
      pdf.font_families.update("DejaVu" => { normal: FONT_DIR.join("DejaVuSans.ttf").to_s, bold: FONT_DIR.join("DejaVuSans-Bold.ttf").to_s })
      pdf.font("DejaVu")
      pdf.font_size(9)
      ranges = @bills.each_with_index.map do |bill, i|
        pdf.start_new_page if i.positive?
        first = pdf.page_number
        draw(pdf, bill)
        [ bill, first..pdf.page_number ]
      end
      # Page numbers count within each customer's bill, so a page handed to one customer never says "page 3 of 40".
      ranges.each do |bill, pages|
        pages.each_with_index do |page, i|
          pdf.go_to_page(page)
          pdf.fill_color MUTED
          pdf.draw_text "#{bill[:number]} · page #{i + 1} of #{pages.count}", at: [ pdf.bounds.right - 160, -20 ], size: 7
        end
      end
      pdf.fill_color "000000"
      pdf.render
    end

    private

    def money(minor) = "#{'-' if minor.to_i.negative?}Rs #{ActiveSupport::NumberHelper.number_to_delimited(format('%.2f', minor.to_i.abs / 100.0))}"
    def date(d) = d ? d.strftime("%-d %b %Y") : "-"

    def draw(pdf, b)
      biz = b[:business]
      cust = b[:customer]
      # Header band
      pdf.fill_color NAVY
      pdf.fill_rectangle [ 0, pdf.cursor ], pdf.bounds.width, 58
      pdf.fill_color "FFFFFF"
      top = pdf.cursor
      pdf.bounding_box([ 12, top - 10 ], width: pdf.bounds.width * 0.6) do
        pdf.text biz[:name].to_s, size: 16, style: :bold
        pdf.text [ biz[:address], biz[:phone] ].compact_blank.join("  ·  "), size: 8
      end
      pdf.bounding_box([ pdf.bounds.width * 0.6, top - 10 ], width: pdf.bounds.width * 0.4 - 12) do
        pdf.text "ACCOUNT BILL", size: 12, style: :bold, align: :right
        pdf.text b[:number].to_s, size: 8, align: :right
        pdf.text b[:period_label].to_s, size: 8, align: :right
      end
      pdf.move_cursor_to top - 58
      pdf.fill_color "000000"
      pdf.move_down 14

      # Customer and dates
      left = [ [ "Customer", cust[:name] ], [ "Khata no.", cust[:khata_no].to_s ], [ "Roll / ID no.", cust[:member_no] ], [ "Room / unit", cust[:room] ],
               [ "Phone", cust[:phone] ], [ "Guardian", [ cust[:guardian_name], cust[:guardian_phone] ].compact_blank.join(", ").presence ] ].reject { |_, v| v.blank? }
      right = [ [ "Bill date", date(b[:bill_date]) ], [ "Period", "#{date(b[:from])} to #{date(b[:to])}" ], [ "Due date", date(b[:due_on]) ] ]
      y = pdf.cursor
      pdf.bounding_box([ 0, y ], width: pdf.bounds.width / 2 - 8) { kv(pdf, left) }
      h1 = y - pdf.cursor
      pdf.bounding_box([ pdf.bounds.width / 2 + 8, y ], width: pdf.bounds.width / 2 - 8) { kv(pdf, right) }
      h2 = y - pdf.cursor
      pdf.move_cursor_to y - [ h1, h2 ].max
      pdf.move_down 12

      # Summary tiles
      t = b[:totals]
      opening = b[:entries].any? { |e| e[:kind] == "opening" }
      tiles = [ [ "Previous balance", b[:brought_forward_minor] ], [ "Purchases", t[:charges_minor] ], [ "Payments", t[:payments_minor] ],
                [ opening ? "Opening & adjustments" : "Adjustments", t[:adjustments_minor] - t[:refunds_minor] + t[:paid_out_minor] ], [ "Amount due", [ b[:closing_balance_minor], 0 ].max ] ]
      w = pdf.bounds.width / tiles.size
      y = pdf.cursor
      tiles.each_with_index do |(label, v), i|
        last = i == tiles.size - 1
        pdf.fill_color(last ? ORANGE : "F3F5F8")
        pdf.fill_rounded_rectangle [ i * w + 2, y ], w - 4, 40, 4
        pdf.fill_color(last ? "FFFFFF" : MUTED)
        pdf.text_box label, at: [ i * w + 8, y - 6 ], width: w - 16, size: 7
        pdf.fill_color(last ? "FFFFFF" : NAVY)
        pdf.text_box money(v), at: [ i * w + 8, y - 19 ], width: w - 16, size: 11, style: :bold
      end
      pdf.fill_color "000000"
      pdf.move_cursor_to y - 52

      # Entries
      rows = [ [ "Date", "Details", "Charges", "Credits", "Balance" ] ]
      rows << [ date(b[:from]), "Balance brought forward", "", "", money(b[:brought_forward_minor]) ]
      b[:entries].each do |e|
        debit = e[:amount_minor].positive? ? money(e[:amount_minor]) : ""
        credit = e[:amount_minor].negative? ? money(-e[:amount_minor]) : ""
        rows << [ date(e[:date]), details(e), debit, credit, money(e[:balance_minor]) ]
      end
      rows << [ "", "No purchases or payments in this period", "", "", "" ] if b[:entries].empty?
      rows << [ "", "Closing balance", "", "", money(b[:closing_balance_minor]) ]
      pdf.table(rows, header: true, width: pdf.bounds.width, column_widths: { 0 => 62, 2 => 72, 3 => 72, 4 => 78 },
                      cell_style: { size: 8, padding: [ 5, 5 ], border_width: 0.5, border_color: LINE, inline_format: false }) do |tbl|
        tbl.row(0).font_style = :bold
        tbl.row(0).background_color = "EEF1F5"
        tbl.row(0).text_color = NAVY
        tbl.columns(2..4).align = :right
        tbl.row(1).text_color = MUTED
        tbl.row(-1).font_style = :bold
      end
      pdf.move_down 14

      due = [ b[:closing_balance_minor], 0 ].max
      msg = if b[:closing_balance_minor].negative?
        "You have #{money(-b[:closing_balance_minor])} in advance on your account. Thank you."
      elsif due.zero?
        "Nothing is due. Thank you."
      else
        "Please pay #{money(due)}#{b[:due_on] ? " by #{date(b[:due_on])}" : ''}. Quote khata no. #{cust[:khata_no]} when you pay."
      end
      pdf.fill_color NAVY
      pdf.text msg, size: 10, style: :bold
      pdf.fill_color MUTED
      pdf.text biz[:footer].to_s, size: 8 if biz[:footer].present?
      pdf.text "If anything on this bill looks wrong, tell us within 7 days and we will check it against your orders.", size: 7
      pdf.fill_color "000000"
    end

    def details(e)
      case e[:kind]
      when "charge" then [ "Order #{e[:order_label]}", e[:items].presence ].compact.join(": ")
      when "payment" then [ "Payment", e[:method_name], e[:reference].presence ].compact.join(", ")
      when "refund" then [ "Refund #{e[:order_label]}", e[:reason].presence ].compact.join(": ")
      when "reversal" then [ "Reversal of #{e[:reverses_label]}", e[:reason].presence ].compact.join(": ")
      else [ KIND_LABEL.fetch(e[:kind], e[:kind].to_s.humanize), e[:reason].presence ].compact.join(": ")
      end
    end

    def kv(pdf, pairs)
      pairs.each do |k, v|
        pdf.fill_color MUTED
        pdf.text_box k, at: [ 0, pdf.cursor ], width: 80, size: 8
        pdf.fill_color "000000"
        pdf.text_box v.to_s, at: [ 82, pdf.cursor ], width: pdf.bounds.width - 82, size: 9, style: k == "Customer" ? :bold : :normal
        pdf.move_down 14
      end
    end
  end
end
