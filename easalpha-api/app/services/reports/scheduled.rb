module Reports
  # Builds the text of a scheduled report and sends it to each recipient by WhatsApp or email.
  module Scheduled
    module_function

    def text_for(schedule, as_of: Date.current)
      from, to = schedule.period(as_of)
      branch = schedule.branch || Branch.active.order(is_main: :desc).first
      business = branch.business
      range = from == to ? from.to_s : "#{from} to #{to}"
      lines = [ "#{business.name}, #{branch.name}: #{schedule.name} (#{range})" ]
      case schedule.kind
      when "daily_summary", "sales", "grand"
        o = Reports::Sales.new(branch: branch, from: from, to: to).overview
        lines << "Orders #{o[:orders]}, net sales Rs #{fmt(o[:revenue_minor])}, discounts Rs #{fmt(o[:discount_minor])}, tax Rs #{fmt(o[:tax_minor])}"
        lines << "Average order Rs #{fmt(o[:average_order_minor])}" if o[:average_order_minor]
        if schedule.kind == "grand"
          o.each { |k, v| lines << "#{k.to_s.tr('_', ' ')}: #{v.is_a?(Hash) ? v.map { |a, b| "#{a} #{b.is_a?(Integer) ? fmt(b) : b}" }.join(', ') : v}" if k.to_s.start_with?("by_") }
        end
      when "items"
        Reports::Sales.new(branch: branch, from: from, to: to).items(limit: 15).each_with_index { |r, i| lines << "#{i + 1}. #{r[:name]} x #{r[:quantity]} Rs #{fmt(r[:revenue_minor])}" }
      when "cashiers"
        Reports::Sales.new(branch: branch, from: from, to: to).cashiers.each { |r| lines << "#{r[:name] || r[:cashier] || 'Cashier'}: #{r[:orders]} orders Rs #{fmt(r[:revenue_minor] || r[:total_minor] || 0)}" }
      when "stock_sheet"
        sheet = Reports::Stock.daily_sheet(section: StockSection.default_for(branch), day: to)
        sheet[:rows].first(30).each { |r| lines << "#{r[:item][:name]}: open #{r[:opening]} in #{r[:in]} out #{r[:out]} waste #{r[:waste]} sale #{r[:sale]} close #{r[:closing]} #{r[:item][:base_unit][:code]}" }
        lines << "Closing value Rs #{fmt(sheet[:closing_value_minor])}"
      when "expenses"
        e = Reports::Expenses.summary(branch: branch, from: from, to: to)
        lines << "Expenses Rs #{fmt(e[:total_minor])} in #{e[:count]} entries; overheads Rs #{fmt(e[:overheads_minor])}"
        e[:by_category].first(10).each { |r| lines << "#{r[:category]}: Rs #{fmt(r[:amount_minor])}" }
      when "payables"
        s = Suppliers::Ledger.summary
        lines << "Payables Rs #{fmt(s[:payables_minor])} across #{s[:suppliers_with_due]} suppliers; open POs #{s[:open_purchase_orders]} worth Rs #{fmt(s[:open_purchase_orders_minor])}"
        Suppliers::Ledger.aging_report[:rows].first(10).each { |r| lines << "#{r[:supplier][:name]}: Rs #{fmt(r[:aging]['total'])} (over 90 days Rs #{fmt(r[:aging]['over_90'])})" }
      when "khata"
        s = Customers::Ledger.summary
        lines << "Khata outstanding Rs #{fmt(s[:total_outstanding_minor])} from #{s[:customers_with_due]} customers"
        Customers::Ledger.aging_report[:rows].first(10).each { |r| lines << "#{r[:customer][:name]} (##{r[:customer][:khata_no]}): Rs #{fmt(r[:aging]['total'])}" }
      end
      lines.join("\n")
    end

    def fmt(minor) = ((minor || 0) / 100.0).round.to_s.reverse.scan(/\d{1,3}/).join(",").reverse

    def deliver!(schedule, as_of: Date.current)
      text = text_for(schedule, as_of: as_of)
      sent = []
      schedule.recipients.each do |to|
        if to.include?("@")
          next unless schedule.channel.in?(%w[email both])
          ReportMailer.scheduled(to: to, subject: "#{schedule.name} #{as_of}", body: text).deliver_later
          sent << to
        else
          next unless schedule.channel.in?(%w[whatsapp both])
          Whatsapp::Sender.deliver(phone: User.normalize_phone(to), template: "scheduled_report", variables: { name: schedule.name, text: text }, counted: true)
          sent << to
        end
      end
      Notification.create!(kind: "scheduled_report", title: "#{schedule.name} sent to #{sent.size} recipient#{'s' unless sent.size == 1}", body: text.lines.first(3).join, link: "/reports")
      { text: text, sent_to: sent }
    end
  end
end
