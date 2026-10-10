class TaxInvoiceSyncJob < ApplicationJob
  queue_as :tax

  def perform(tax_invoice_id)
    Tenancy::Context.unscoped do
      invoice = TaxInvoice.unscoped.find_by(id: tax_invoice_id)
      return unless invoice && invoice.status.in?(%w[queued failed])
      within_business(invoice.business_id) { Tax::Invoicer.submit!(TaxInvoice.find(invoice.id)) }
    end
  end
end
