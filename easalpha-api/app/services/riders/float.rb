module Riders
  # Rider cash float (ArfaPOS Rider Vault): company cash issued to a rider, returned, spent on the road, adjusted, and settled at shift end.
  module Float
    module_function

    def move!(rider, kind:, amount_minor:, actor:, branch:, shift: nil, reason: nil, category_id: nil)
      raise Api::Errors::BadRequest.new("float.amount", "Amount must be positive") unless amount_minor.positive?
      day = branch.business_day_for(Time.current)
      Rider.transaction do
        account = shift&.drawer_account || PaymentMethod.active.find_by(kind: "cash")&.payment_account
        delta = case kind
        when "issue" then amount_minor
        when "return" then -amount_minor
        when "spend" then -amount_minor
        when "adjust" then amount_minor
        else raise Api::Errors::BadRequest.new("float.kind", "Unknown movement #{kind}")
        end
        raise Api::Errors::Conflict.new("float.insufficient", "#{rider.name} holds only Rs #{rider.float_minor / 100}") if kind.in?(%w[return spend]) && rider.float_minor < amount_minor
        expense = nil
        if kind == "spend"
          category = category_id ? ExpenseCategory.active.find(category_id) : (ExpenseCategory.active.find_by(name: "Rider expense") || ExpenseCategory.active.find_by(name: "Transport") || ExpenseCategory.active.first || ExpenseCategory.create!(name: "Transport"))
          expense = Expense.create!(branch: branch, category: category, number: DocumentCounter.next!("expense"), amount_minor: amount_minor, note: "#{rider.name}: #{reason}", spent_on: Date.current, business_day: day,
                                    source: "rider_float", by_membership_id: actor&.id, paid_to: rider.name)
        end
        m = RiderCashMovement.create!(rider: rider, kind: kind, amount_minor: kind == "adjust" ? amount_minor : (delta.negative? ? -amount_minor : amount_minor), reason: reason, payment_account_id: account&.id, expense_id: expense&.id,
                                      shift_id: shift&.id, by_membership_id: actor&.id, business_day: day, occurred_at: Time.current)
        rider.move_float!(delta)
        if kind.in?(%w[issue return]) && account
          account.post!(kind: "rider_float", amount_minor: kind == "issue" ? -amount_minor : amount_minor, business_day: day, ref: m, description: "#{kind == 'issue' ? 'Float issued to' : 'Float returned by'} #{rider.name}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        end
        AuditLog.record(action: "rider_float_#{kind}", record: m, after: { rider: rider.name, amount_minor: amount_minor, reason: reason })
        m
      end
    end

    # Statement of the float: movements in order with a running balance.
    def statement(rider, from: nil, to: nil)
      scope = RiderCashMovement.where(rider_id: rider.id).order(:occurred_at, :created_at)
      scope = scope.where(business_day: from..to) if from && to
      rows = scope.map { |m| { id: m.id, kind: m.kind, amount_minor: m.amount_minor, reason: m.reason, business_day: m.business_day, occurred_at: m.occurred_at, by_membership_id: m.by_membership_id, expense_id: m.expense_id, settlement_id: m.settlement_id } }
      balance = 0
      rows.each { |r| balance += r[:kind] == "settle" ? -r[:amount_minor] : r[:amount_minor]; r[:balance_minor] = balance }
      { rider: DeliverySerializers.rider(rider), float_minor: rider.float_minor, rows: rows }
    end

    PAYABLE = %w[draft held placed preparing ready served dispatched].freeze

    # Cash on delivery is counted once, as the order's cash payment (QA F1: the till took it as a payment and the
    # settlement deposited it again). An order already paid at the till was the hand-in, so the rider no longer holds
    # its cash; what the rider still owes is the cash collected on orders not paid yet, up to what each one is due.
    def owed_for(delivery)
      order = delivery.order
      return 0 unless order && order.status.in?(PAYABLE)
      delivery.cash_collected_minor.to_i.clamp(0, [ order.total_minor - order.paid_minor, 0 ].max)
    end

    # Settles delivered cash-on-delivery orders: the cash still owed on them plus the float held is what the rider
    # hands in. cash_collected_minor is that cash; collected_total_minor all the cash collected, paid_at_till_minor
    # the part already taken at the till.
    def preview(rider)
      deliveries = rider.unsettled_deliveries.includes(:order).to_a
      collected = deliveries.sum { |d| d.cash_collected_minor.to_i }
      owed = deliveries.sum { |d| owed_for(d) }
      { rider: DeliverySerializers.rider(rider), deliveries_count: deliveries.size, cash_collected_minor: owed, collected_total_minor: collected, paid_at_till_minor: collected - owed,
        float_held_minor: rider.float_minor, expected_minor: owed + rider.float_minor, deliveries: deliveries.map { |d| DeliverySerializers.delivery(d) } }
    end

    def settle!(rider, handed_in_minor:, actor:, branch:, shift: nil, device: nil, note: nil, keep_float: false)
      day = branch.business_day_for(Time.current)
      Rider.transaction do
        p = preview(rider)
        expected = keep_float ? p[:cash_collected_minor] : p[:expected_minor]
        account = shift&.drawer_account || PaymentMethod.active.find_by(kind: "cash")&.payment_account
        s = RiderSettlement.create!(rider: rider, shift_id: shift&.id, number: DocumentCounter.next!("rider_settlement"), deliveries_count: p[:deliveries_count], cash_collected_minor: p[:cash_collected_minor],
                                    float_held_minor: keep_float ? 0 : rider.float_minor, spent_minor: 0, expected_minor: expected, handed_in_minor: handed_in_minor, difference_minor: handed_in_minor - expected,
                                    payment_account_id: account&.id, note: note, settled_by_membership_id: actor&.id, settled_at: Time.current)
        take_cod_payments!(rider.unsettled_deliveries.includes(:order).to_a, actor: actor, device: device, shift: shift)
        rider.unsettled_deliveries.update_all(settled_at: Time.current, settlement_id: s.id)
        unless keep_float || rider.float_minor.zero?
          RiderCashMovement.create!(rider: rider, kind: "settle", amount_minor: rider.float_minor, reason: "Settled #{s.label}", settlement_id: s.id, shift_id: shift&.id, by_membership_id: actor&.id, business_day: day, occurred_at: Time.current)
          rider.update!(float_minor: 0)
        end
        if account && !keep_float && s.float_held_minor.positive?
          account.post!(kind: "rider_float", amount_minor: s.float_held_minor, business_day: day, ref: s, description: "Float returned at settlement by #{rider.name}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        end
        if account && s.difference_minor != 0
          account.post!(kind: "adjustment", amount_minor: s.difference_minor, business_day: day, ref: s, description: "Rider settlement #{s.difference_minor.negative? ? 'short' : 'over'} #{rider.name}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        end
        Notification.create!(kind: "rider_short", title: "#{rider.name} short by Rs #{-s.difference_minor / 100} at settlement", body: note.to_s, link: "/riders/#{rider.id}") if s.difference_minor.negative?
        AuditLog.record(action: "rider_settle", record: s, after: { rider: rider.name, expected_minor: expected, handed_in_minor: handed_in_minor, difference_minor: s.difference_minor })
        s
      end
    end

    # The cash the rider hands in for an unpaid order is that order's cash payment, into the same drawer as the rest
    # of the settlement: the sale is paid and its cash counted once, whichever comes first, the till or the settlement.
    def take_cod_payments!(deliveries, actor:, device:, shift:)
      cash = nil
      deliveries.each do |d|
        owed = owed_for(d)
        next unless owed.positive?
        cash ||= PaymentMethod.active.find_by(kind: "cash") or raise Api::Errors::Conflict.new("settle.no_cash_method", "Turn on a cash payment method to settle cash on delivery")
        Payments::Processor.new(d.order, actor: actor, device: device, shift: shift).call(payments: [ { id: SecureRandom.uuid, method_code: cash.code, amount_minor: owed, tendered_minor: owed } ])
      end
    end
  end
end
