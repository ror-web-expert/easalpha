module Orders
  # SPEC statuses (Pending, Preparing, Ready, Dispatched, Completed, Cancelled; Open = the first four) and SPEC payment
  # statuses (Paid, Pending, Unpaid, Account, Complimentary) read over EasAlpha's finer internal states, which stay as extras.
  module SpecStatus
    STATUS_MAP = {
      "pending" => %w[draft held placed], "preparing" => %w[preparing], "ready" => %w[ready served], "dispatched" => %w[dispatched],
      "completed" => %w[paid closed], "cancelled" => %w[voided refunded]
    }.freeze
    OPEN = %w[pending preparing ready dispatched].freeze

    module_function

    def of(order)
      STATUS_MAP.find { |_, internal| internal.include?(order.status) }&.first
    end

    # Internal statuses for a filter value that may be a SPEC name, "open", or an internal name.
    def internal_for(value)
      v = value.to_s
      return STATUS_MAP[v] if STATUS_MAP.key?(v)
      return Order::OPEN_STATUSES if v == "open"
      [ v ]
    end

    def payment_of(order)
      return "complimentary" if order.is_staff_meal
      return "account" if order.payment_status == "paid" && order.payment_method_summary.to_s.include?("khata:")
      case order.payment_status
      when "paid" then "paid"
      when "partial" then "pending"
      else "unpaid"
      end
    end

    # SQL conditions for a SPEC payment-status filter; internal names pass through.
    def payment_scope(scope, value)
      case value.to_s
      when "complimentary" then scope.where(is_staff_meal: true)
      when "account" then scope.where(payment_status: "paid").where("payment_method_summary LIKE ?", "%khata:%")
      when "pending" then scope.where(payment_status: "partial")
      when "paid" then scope.where(payment_status: "paid", is_staff_meal: false)
      when "unpaid" then scope.where(payment_status: "unpaid", is_staff_meal: false)
      else scope.where(payment_status: value)
      end
    end
  end
end
