# Loyalty points: earned on paid orders, redeemed as a discount before payment, refunded when a redeemed order is voided.
module Loyalty
  module_function

  DEFAULTS = { "loyalty_enabled" => false, "loyalty_rupees_per_point" => 100, "loyalty_point_value_minor" => 100, "loyalty_min_redeem_points" => 100, "loyalty_max_redeem_percent" => 50, "birthday_discount_percent" => 10, "birthday_offer_days" => 7 }.freeze

  def settings(business = Current.business)
    DEFAULTS.keys.index_with { |k| business.settings.fetch(k, DEFAULTS[k]) }
  end

  def enabled?(business = Current.business) = ActiveModel::Type::Boolean.new.cast(settings(business)["loyalty_enabled"])

  def earn!(order)
    return unless enabled?(order.business) && order.customer_id && !order.is_staff_meal
    customer = Customer.find_by(id: order.customer_id)
    return if customer.nil? || customer.is_walk_in
    return if LoyaltyTransaction.where(order_id: order.id, kind: "earn").exists?
    rupees_per_point = settings(order.business)["loyalty_rupees_per_point"].to_i.clamp(1, 1_000_000)
    points = (order.total_minor - order.discounts.where(kind: "loyalty").sum(:amount_minor)) / 100 / rupees_per_point
    return if points <= 0
    post!(customer, points: points, kind: "earn", order: order, note: "Order #{order.label}")
  end

  def redeem!(order, points:, actor:)
    raise Api::Errors::Conflict.new("loyalty.disabled", "Loyalty is switched off") unless enabled?(order.business)
    raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
    customer = order.customer_id && Customer.find_by(id: order.customer_id)
    raise Api::Errors::Conflict.new("loyalty.no_customer", "Attach a customer to redeem points") if customer.nil? || customer.is_walk_in
    s = settings(order.business)
    points = points.to_i
    raise Api::Errors::BadRequest.new("loyalty.min", "Redeem at least #{s['loyalty_min_redeem_points']} points") if points < s["loyalty_min_redeem_points"].to_i
    raise Api::Errors::Conflict.new("loyalty.insufficient", "#{customer.name} has #{customer.loyalty_points} points") if customer.loyalty_points < points
    raise Api::Errors::Conflict.new("loyalty.already", "Points were already redeemed on this order") if order.discounts.where(kind: "loyalty").exists?
    value_minor = points * s["loyalty_point_value_minor"].to_i
    cap = (order.subtotal_minor * s["loyalty_max_redeem_percent"].to_i / 100)
    raise Api::Errors::Conflict.new("loyalty.cap", "At most Rs #{cap / 100} (#{s['loyalty_max_redeem_percent']}% of the bill) can be paid with points") if value_minor > cap
    Order.transaction do
      order.discounts.create!(kind: "loyalty", value: BigDecimal(value_minor.to_s) / 100, reason: "#{points} loyalty points", applied_by_membership_id: actor&.id)
      Orders::Pricing.recalculate!(order.reload)
      Orders::Pricing.save_all!(order)
      post!(customer, points: -points, kind: "redeem", order: order, note: "Order #{order.label}", by: actor)
    end
    order
  end

  def refund_on_void!(order)
    redeemed = LoyaltyTransaction.where(order_id: order.id, kind: "redeem").sum(:points)
    return if redeemed.zero? || LoyaltyTransaction.where(order_id: order.id, kind: "refund").exists?
    customer = Customer.find_by(id: order.customer_id) or return
    post!(customer, points: -redeemed, kind: "refund", order: order, note: "Void #{order.label}")
  end

  def adjust!(customer, points:, note:, by:)
    raise Api::Errors::BadRequest.new("loyalty.points", "Points must not be zero") if points.to_i.zero?
    post!(customer, points: points.to_i, kind: "adjust", note: note, by: by)
  end

  def post!(customer, points:, kind:, order: nil, note: nil, by: nil)
    Customer.transaction do
      customer.lock!
      balance = customer.loyalty_points + points
      customer.update!(loyalty_points: balance)
      LoyaltyTransaction.create!(customer: customer, order: order, points: points, balance_after: balance, kind: kind, note: note, by_membership_id: by&.id, occurred_at: Time.current)
    end
  end

  def ledger(customer, limit: 100)
    LoyaltyTransaction.where(customer_id: customer.id).order(occurred_at: :desc).limit(limit).map do |t|
      { id: t.id, kind: t.kind, points: t.points, balance_after: t.balance_after, order_id: t.order_id, note: t.note, occurred_at: t.occurred_at }
    end
  end

  # Birthday offers: a one-use coupon for each opted-in customer whose birthday is today, sent by WhatsApp.
  def birthday_offers!(today: Date.current)
    s = settings
    sent = 0
    Customer.active.where(whatsapp_opt_in: true, opted_out_at: nil).where.not(phone: nil).where("EXTRACT(MONTH FROM birthday) = ? AND EXTRACT(DAY FROM birthday) = ?", today.month, today.day).find_each do |c|
      code = "BDAY#{today.strftime('%d%m')}#{c.khata_no}"
      next if Promotion.where(coupon_code: code).exists?
      Promotion.create!(name: "Birthday offer for #{c.name}", kind: "coupon", value: s["birthday_discount_percent"].to_i, coupon_code: code, valid_from: Time.current, valid_to: s["birthday_offer_days"].to_i.days.from_now, unit_limit: 1)
      Whatsapp::Sender.deliver(phone: c.phone, template: "birthday_offer", kind: "marketing", customer_id: c.id, variables: { name: c.name, code: code, percent: s["birthday_discount_percent"], days: s["birthday_offer_days"] })
      sent += 1
    end
    sent
  end
end
