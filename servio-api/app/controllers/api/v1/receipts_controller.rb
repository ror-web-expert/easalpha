module Api
  module V1
    class ReceiptsController < BaseController
      before_action :authenticate!

      def show
        order = Order.includes(items: :modifiers).find(params[:id])
        render json: Receipts::Builder.build(order)
      end

      # POST /orders/:order_id/receipt/reprint  marks the receipt DUPLICATE and logs it
      def reprint
        require_permission!("receipts.reprint")
        order = Order.includes(items: :modifiers).find(params[:id])
        ReceiptEvent.create!(order: order, kind: "reprint", membership_id: current_membership.id, device_id: current_device&.id, channel: "print")
        audit!("update", record: order, after: { reprint: true })
        render json: Receipts::Builder.build(order, duplicate: true)
      end

      def printed
        order = Order.find(params[:id])
        ReceiptEvent.create!(order: order, kind: "print", membership_id: current_membership.id, device_id: current_device&.id, channel: "print")
        head :no_content
      end

      # POST /orders/:order_id/receipt/send  phone?  sends the digital receipt by WhatsApp
      def send_receipt
        order = Order.includes(:customer).find(params[:id])
        phone = User.normalize_phone(params[:phone].presence || order.customer&.phone)
        raise Api::Errors::BadRequest.new("receipt.no_phone", "No phone number for this order") if phone.blank?
        msg = Whatsapp::Sender.deliver(phone: phone, template: "digital_receipt", customer_id: order.customer_id,
                                       variables: { business_name: current_business.name, order_label: order.label, total: order.total_minor / 100, receipt_number: order.receipt_number, link: "https://#{current_business.slug}.servio.menu/r/#{order.id}" })
        ReceiptEvent.create!(order: order, kind: "whatsapp", membership_id: current_membership.id, device_id: current_device&.id, channel: "whatsapp")
        render json: { sent: true, status: msg.status, to: phone }
      end
    end
  end
end
