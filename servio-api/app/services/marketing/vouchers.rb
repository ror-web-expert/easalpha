module Marketing
  # SPEC Vouchers: batches with a value, a minimum spend and an expiry. Personal codes are generated per customer and
  # sent from the POS campaign screen; a public code works on any order until it expires or hits its limit. A voucher's
  # value was fixed when the batch was created, so applying one never counts against the cashier's discount limit.
  module Vouchers
    module_function

    def create_batch!(attrs, actor:)
      VoucherBatch.create!(attrs.merge(created_by_membership_id: actor&.id))
    end

    # Personal codes for a list of customers; optionally sent over WhatsApp.
    def issue!(batch, customer_ids:, send: true, actor: nil)
      raise Api::Errors::Conflict.new("voucher.public", "A public batch has one shared code") unless batch.kind == "personal"
      customers = Customer.active.where(id: customer_ids).reject(&:is_walk_in)
      issued = customers.map do |c|
        v = Voucher.where(voucher_batch_id: batch.id, customer_id: c.id, status: "issued").first || Voucher.create!(voucher_batch: batch, customer: c, code: Voucher.generate_code(batch.name.to_s[0, 3].upcase.gsub(/[^A-Z0-9]/, "V")))
        if send && c.phone.present? && Whatsapp::Account.master_enabled?
          msg = Whatsapp::Sender.deliver(phone: c.phone, template: "voucher", kind: "marketing", customer_id: c.id,
                                         variables: { customer_name: c.name, code: v.code, value: value_text(batch), min_spend: batch.min_spend_minor / 100, expires_on: batch.expires_on&.to_s || "no expiry", business_name: c.business.name })
          v.update!(sent_at: Time.current, whatsapp_message_id: msg&.id)
        end
        v
      end
      batch.update!(issued_count: Voucher.where(voucher_batch_id: batch.id).count)
      AuditLog.record(action: "create", record: batch, after: { issued: issued.size }) if actor
      issued
    end

    def value_text(batch) = batch.value_kind == "percent" ? "#{batch.value.to_f}%" : "Rs #{batch.value.to_i}"

    # Finds the voucher a code refers to for an order: a personal code only for its customer, a public code for anyone.
    def lookup!(code, order:)
      code = code.to_s.strip.upcase
      if (v = Voucher.find_by(code: code))
        batch = v.voucher_batch
        raise Api::Errors::Conflict.new("voucher.used", "This voucher was already redeemed") unless v.status == "issued"
        raise Api::Errors::Conflict.new("voucher.customer", "This voucher belongs to another customer") if v.customer_id && v.customer_id != order.customer_id
      elsif (batch = VoucherBatch.active.find_by(public_code: code))
        v = nil
      else
        raise Api::Errors::NotFound.new("voucher.invalid", "This voucher code does not exist")
      end
      raise Api::Errors::Conflict.new("voucher.inactive", "This voucher batch is switched off") unless batch.active && batch.archived_at.nil?
      raise Api::Errors::Conflict.new("voucher.expired", "This voucher expired on #{batch.expires_on}") if batch.expired?
      raise Api::Errors::Conflict.new("voucher.exhausted", "This voucher has reached its usage limit") if batch.exhausted?
      [batch, v]
    end

    def redeem!(order, code:, actor:)
      raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
      raise Api::Errors::Conflict.new("voucher.already", "A voucher is already applied to this order") if order.discounts.where(kind: "voucher").exists?
      batch, voucher = lookup!(code, order: order)
      base = order.subtotal_minor - order.discounts.where.not(kind: "voucher").sum(:amount_minor)
      raise Api::Errors::Conflict.new("voucher.min_spend", "This voucher needs a spend of Rs #{batch.min_spend_minor / 100}") if base < batch.min_spend_minor
      amount = batch.discount_for(base)
      Order.transaction do
        voucher ||= Voucher.create!(voucher_batch: batch, code: "#{batch.public_code}-#{SecureRandom.hex(3).upcase}", status: "issued")
        d = order.discounts.create!(kind: "voucher", value: BigDecimal(amount.to_s) / 100, reason: "Voucher #{code.to_s.upcase} (#{batch.name})", voucher_id: voucher.id, applied_by_membership_id: actor&.id)
        voucher.update!(status: "redeemed", redeemed_order_id: order.id, redeemed_at: Time.current, customer_id: voucher.customer_id || order.customer_id)
        VoucherBatch.where(id: batch.id).update_all("redeemed_count = redeemed_count + 1")
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        AuditLog.record(action: "discount", record: order, after: { voucher: voucher.code, amount_minor: d.amount_minor })
      end
      order
    end

    # When a voucher discount is removed or the order is voided, the code is usable again.
    def release!(discount)
      v = discount.voucher_id && Voucher.find_by(id: discount.voucher_id)
      return unless v && v.status == "redeemed"
      v.update!(status: "issued", redeemed_order_id: nil, redeemed_at: nil)
      VoucherBatch.where(id: v.voucher_batch_id).update_all("redeemed_count = GREATEST(redeemed_count - 1, 0)")
    end

    def report(branch:, from:, to:)
      redeemed = DiscountApplied.joins(:order).where(kind: "voucher", orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded] })
      vouchers = Voucher.where(id: redeemed.select(:voucher_id)).includes(:voucher_batch).group_by(&:voucher_batch_id)
      amounts = redeemed.group(:voucher_id).sum(:amount_minor)
      rows = VoucherBatch.unscope(where: :archived_at).order(created_at: :desc).map do |b|
        vs = vouchers[b.id] || []
        { batch: MarketingSerializers.batch(b), issued: b.issued_count, redeemed_in_period: vs.size, redeemed_total: b.redeemed_count, amount_minor: vs.sum { |v| amounts[v.id].to_i },
          issued_in_period: Voucher.where(voucher_batch_id: b.id, created_at: from.beginning_of_day..to.end_of_day).count }
      end
      { from: from, to: to, rows: rows, totals: { redeemed: redeemed.count, amount_minor: redeemed.sum(:amount_minor), issued: rows.sum { |r| r[:issued_in_period] } } }
    end
  end
end
