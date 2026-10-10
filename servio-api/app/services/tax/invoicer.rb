module Tax
  # Creates the tax invoice record when an order is paid and queues it for sync.
  module Invoicer
    module_function

    def registered?(branch)
      reg = branch.tax_registration || {}
      reg["authority"].present? && reg["authority"] != "none" && (reg["ntn"].present? || reg["pos_id"].present?)
    end

    def enqueue_for(order)
      branch = order.branch
      return nil unless registered?(branch)
      return TaxInvoice.find_by(order_id: order.id) if TaxInvoice.exists?(order_id: order.id)
      reg = branch.tax_registration
      invoice = TaxInvoice.create!(order: order, branch: branch, authority: reg["authority"], request_payload: payload_for(order, reg), status: "queued")
      safe_enqueue { TaxInvoiceSyncJob.perform_later(invoice.id) }
      invoice
    end

    def safe_enqueue
      yield
    rescue StandardError => e
      Rails.logger.error("[tax] enqueue failed: #{e.class}: #{e.message}")
    end

    def payload_for(order, reg)
      {
        "pos_id" => reg["pos_id"], "ntn" => reg["ntn"], "strn" => reg["strn"], "branch" => order.branch.name, "invoice_type" => 1,
        "order_label" => order.label, "receipt_number" => order.receipt_number, "business_day" => order.business_day.to_s, "paid_at" => order.paid_at&.iso8601,
        "payment_mode" => order.payment_method_summary, "customer" => order.customer && { "name" => order.customer.name, "phone" => order.customer.phone },
        "total_minor" => order.total_minor, "tax_minor" => order.tax_minor, "discount_minor" => order.discount_minor, "service_charge_minor" => order.service_charge_minor,
        "items" => order.active_items.map { |i| { "name" => i.name_snapshot, "quantity" => i.quantity.to_s("F"), "unit_price_minor" => i.unit_price_minor, "tax_rate" => i.tax_rate_snapshot.to_f, "tax_minor" => i.line_tax_minor, "total_minor" => i.line_total_minor } }
      }
    end

    def submit!(invoice)
      adapter = Tax::Adapter.for(invoice.branch)
      result = adapter.submit(invoice)
      invoice.update!(status: "accepted", invoice_number: result.number, qr_payload: result.qr, response_payload: result.raw, sent_at: Time.current, last_error: nil, attempts: invoice.attempts + 1)
      Realtime.order_changed(invoice.order)
      invoice
    rescue Tax::Adapter::Error, SocketError, Timeout::Error, Errno::ECONNREFUSED => e
      attempts = invoice.attempts + 1
      wait = [ 60 * (2**[ attempts - 1, 6 ].min), 3600 ].min
      invoice.update!(status: "failed", attempts: attempts, last_error: e.message, next_attempt_at: wait.seconds.from_now)
      invoice
    end

    def queue_summary(branch_id: nil)
      scope = TaxInvoice.all
      scope = scope.where(branch_id: branch_id) if branch_id
      { queued: scope.where(status: "queued").count, failed: scope.where(status: "failed").count, accepted: scope.where(status: "accepted").count,
        oldest_pending_at: scope.where(status: %w[queued failed]).minimum(:created_at), last_accepted_at: scope.where(status: "accepted").maximum(:sent_at) }
    end
  end
end
