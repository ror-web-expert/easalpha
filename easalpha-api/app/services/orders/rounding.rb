module Orders
  # The order total is rounded once, when it is computed, so every figure after it (the Pay button, the amount, the
  # change, the receipt, what is posted) is the same whole number. The step is the business setting total_rounding in
  # whole currency units (0 keeps the minor units); blank uses the currency: whole rupees for PKR, which has no paisa in
  # circulation, nothing for currencies shown with decimals. Cash rounding to Rs 5 or Rs 10 (cash_rounding) is a
  # separate step applied by Payments::Processor on the first cash payment, on top of this one.
  module Rounding
    # Currencies the apps show without decimals (easalpha-web src/lib/money.ts).
    WHOLE_UNIT_CURRENCIES = %w[PKR].freeze

    module_function

    def step_minor(business)
      configured = business.setting("total_rounding")
      return [ configured.to_i, 0 ].max * 100 unless configured.nil? || configured.to_s.strip.empty?
      WHOLE_UNIT_CURRENCIES.include?(business.currency.to_s.upcase) ? 100 : 0
    end

    # Nearest step, halves up (Rs 1,391.50 becomes Rs 1,392), as the till's roundToStep does.
    def round(amount_minor, step_minor)
      step = step_minor.to_i
      return amount_minor.to_i if step <= 1
      ((amount_minor.to_i + step / 2).div(step)) * step
    end
  end
end
