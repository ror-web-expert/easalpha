# Re-enqueues failed tax invoices whose backoff has passed. Scheduled every 5 minutes.
class TaxQueueSweepJob < ApplicationJob
  queue_as :tax

  def perform
    Tenancy::Context.unscoped do
      TaxInvoice.unscoped.where(status: %w[queued failed]).where("next_attempt_at is null or next_attempt_at <= ?", Time.current).where("attempts < 50").find_each do |inv|
        TaxInvoiceSyncJob.perform_later(inv.id)
      end
    end
  end
end
