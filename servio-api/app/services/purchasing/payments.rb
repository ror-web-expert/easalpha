module Purchasing
  # Numbered supplier payments by method and account. "paid" settles what we owe; "received" is money the supplier gives back.
  module Payments
    module_function

    def record!(supplier, amount_minor:, method_code:, actor:, branch:, shift: nil, reference: nil, note: nil, goods_receipt_id: nil, direction: "paid", paid_on: nil, purchase_order_id: nil)
      raise Api::Errors::BadRequest.new("payment.amount", "Amount must be positive") unless amount_minor.positive?
      method = PaymentMethod.active.find_by!(code: method_code)
      raise Api::Errors::BadRequest.new("supplier_payment.method", "Choose a cash, card, wallet or bank method") if method.khata?
      day = branch.business_day_for(Time.current)
      po = purchase_order_id.present? ? PurchaseOrder.find(purchase_order_id) : (goods_receipt_id.present? ? GoodsReceipt.find(goods_receipt_id).purchase_order : nil)
      raise Api::Errors::BadRequest.new("supplier_payment.purchase_order", "#{po.label} belongs to another supplier") if po && po.supplier_id != supplier.id
      SupplierPayment.transaction do
        account = method.cash? && shift&.drawer_account ? shift.drawer_account : method.payment_account
        sp = SupplierPayment.create!(supplier: supplier, branch_id: branch.id, number: DocumentCounter.next!("supplier_payment"), direction: direction, amount_minor: amount_minor, payment_method: method,
                                     payment_account: account, reference: reference, note: note, goods_receipt_id: goods_receipt_id, purchase_order_id: po&.id, paid_on: paid_on || Date.current, business_day: day,
                                     by_membership_id: actor&.id, shift_id: shift&.id)
        supplier.move_balance!(direction == "paid" ? -amount_minor : amount_minor)
        PurchaseOrder.where(id: po.id).update_all([ "paid_minor = paid_minor + ?", direction == "paid" ? amount_minor : -amount_minor ]) if po
        account&.post!(kind: "supplier_payment", amount_minor: direction == "paid" ? -amount_minor : amount_minor, business_day: day, ref: sp,
                       description: "#{direction == 'paid' ? 'Paid to' : 'Received from'} #{supplier.name} #{sp.label}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        AuditLog.record(action: "supplier_payment", record: sp, after: { supplier: supplier.name, amount_minor: amount_minor, direction: direction, method: method.code })
        sp
      end
    end
  end
end
