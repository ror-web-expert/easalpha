module Payroll
  # WhatsApp messages to an employee: advance paid, daily or weekly wage paid, monthly salary paid, and their statement
  # on request. Each automatic message has its own switch (payroll.whatsapp.*) and the employee's own opt-out.
  module Notify
    module_function

    TEMPLATES = [
      [ "employee_advance_paid", "{business_name}: {employee_name}, an advance of Rs {amount} ({advance}) was paid to you on {date}. Advances outstanding: Rs {outstanding}." ],
      [ "employee_wage_paid", "{business_name}: {employee_name}, your wage for {period} was paid: {days} day(s), Rs {gross}{extras}. Paid Rs {net} on {date}. Advances outstanding: Rs {outstanding}." ],
      [ "employee_salary_paid", "{business_name}: {employee_name}, your salary for {month} was paid. Gross Rs {gross}, deductions Rs {deductions}, advance recovered Rs {recovered}, net paid Rs {net}. Days present {present}, absent {absent}." ],
      [ "employee_statement", "{business_name}: {employee_name}, your statement from {from} to {to}: earned Rs {earned}, paid Rs {paid}, advances Rs {advances}. {balance_line}" ]
    ].freeze

    def advance_paid!(advance)
      e = advance.employee
      return [] unless on?(e, "payroll.whatsapp.advance_paid")
      deliver(e, "employee_advance_paid", amount: rupees(advance.amount_minor), advance: advance.label, date: fmt(advance.paid_at&.to_date || Date.current), outstanding: rupees(outstanding(e)))
    end

    def wage_paid!(wp)
      e = wp.employee
      return [] unless on?(e, "payroll.whatsapp.wage_paid")
      extras = []
      extras << " + bonus Rs #{rupees(wp.bonus_minor)}" if wp.bonus_minor.positive?
      extras << " - deductions Rs #{rupees(wp.deductions_minor)}" if wp.deductions_minor.positive?
      extras << " - advance Rs #{rupees(wp.advance_recovered_minor)}" if wp.advance_recovered_minor.positive?
      period = wp.period_from == wp.period_to ? fmt(wp.period_from) : "#{fmt(wp.period_from)} to #{fmt(wp.period_to)}"
      deliver(e, "employee_wage_paid", period: period, days: wp.days_worked.to_f.then { |d| d == d.to_i ? d.to_i : d }, gross: rupees(wp.gross_minor), extras: extras.join,
                                        net: rupees(wp.net_minor), date: fmt(wp.paid_at&.to_date || Date.current), outstanding: rupees(outstanding(e)))
    end

    def salary_paid!(payslip, run)
      e = payslip.employee
      return [] unless on?(e, "payroll.whatsapp.salary_paid")
      deliver(e, "employee_salary_paid", month: run.month.strftime("%B %Y"), gross: rupees(payslip.base_minor + payslip.earnings_minor),
                                          deductions: rupees(payslip.deductions_minor + payslip.absence_minor + payslip.late_fines_minor), recovered: rupees(payslip.advances_recovered_minor),
                                          net: rupees(payslip.net_minor), present: payslip.days_present, absent: payslip.days_absent)
    end

    # Manual: the statement summary for a period, sent when the owner presses Send.
    def statement!(employee, statement)
      Whatsapp::Account.guard!(employee.business)
      raise Api::Errors::BadRequest.new("whatsapp.no_phone", "#{employee.name} has no phone number") if employee.phone.blank?
      Whatsapp::Provider.require_live!(employee.business) # sent by hand, so it never reports a message that cannot go out as sent
      bal = statement[:closing_balance_minor]
      line = bal.positive? ? "Still to be paid to you: Rs #{rupees(bal)}." : bal.negative? ? "You owe (advances): Rs #{rupees(-bal)}." : "Nothing is due either way."
      t = statement[:totals]
      deliver(employee, "employee_statement", from: fmt(statement[:from]), to: fmt(statement[:to]), earned: rupees(t[:earned_minor]), paid: rupees(t[:paid_minor]),
                                               advances: rupees(t[:advances_minor]), balance_line: line).tap do |msgs|
        raise Api::Errors::Conflict.new("whatsapp.disabled", "WhatsApp sending is switched off in Settings") if msgs.empty?
      end
    end

    def on?(employee, key)
      b = employee.business
      BusinessModules.on?(b, "payroll") && employee.whatsapp_notify && employee.phone.present? && Whatsapp::Account.master_enabled?(b) &&
        ActiveModel::Type::Boolean.new.cast(b.setting(key)) != false
    end

    def deliver(employee, name, vars)
      business = employee.business
      return [] unless Whatsapp::Account.master_enabled?(business) && employee.phone.present?
      tpl = template(name)
      vars = vars.merge(employee_name: employee.name, business_name: business.name)
      [ Whatsapp::Sender.deliver(phone: employee.phone, template: tpl.name, variables: vars.merge(text: Whatsapp::Account.render(tpl.body, vars)), kind: "utility", business: business) ]
    rescue StandardError => e
      raise if e.is_a?(Api::Errors::ApiError)
      Rails.logger.error("[payroll whatsapp] #{name} for #{employee.id}: #{e.message}")
      []
    end

    def template(name)
      WhatsappTemplate.where(business_id: Current.business_id, name: name).first || WhatsappTemplate.where(business_id: nil, name: name, language: "en").first || begin
        TEMPLATES.each do |n, body|
          WhatsappTemplate.find_or_initialize_by(business_id: nil, name: n, language: "en").update!(category: "utility", body: body, approval_status: "approved",
                                                                                                variables: %w[business_name employee_name amount advance date outstanding period days gross extras net month deductions recovered present absent from to earned paid advances balance_line])
        end
        WhatsappTemplate.find_by!(business_id: nil, name: name, language: "en")
      end
    end

    def outstanding(employee) = Advance.where(employee_id: employee.id, status: "paid").sum(:outstanding_minor)
    def rupees(minor) = Customers::Notify.rupees(minor)
    def fmt(d) = d&.strftime("%-d %b %Y")
  end
end
