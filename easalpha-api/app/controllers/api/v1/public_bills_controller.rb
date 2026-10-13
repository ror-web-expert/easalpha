module Api
  module V1
    # The bill link sent on WhatsApp: no login, the signed token names the business, customer and period. Shows the
    # bill as JSON for the web page and as a PDF to download. Rebuilt from the ledger, so it is always current.
    class PublicBillsController < ActionController::API
      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: { code: "not_found", message: "This bill link is not valid" } }, status: :not_found
      end

      # GET /public/bills/:token
      def show
        with_bill { |customer, bill| render json: bill.merge(pdf_url: "/api/v1/public/bills/#{params[:token]}/pdf", balance_now_minor: customer.balance_minor) }
      end

      # GET /public/bills/:token/pdf
      def pdf
        with_bill { |_customer, bill| send_data Customers::BillPdf.render([ bill ]), filename: bill[:filename], type: "application/pdf", disposition: params[:download] == "1" ? "attachment" : "inline" }
      end

      private

      # A link stops working once its business is deleted or its customer is archived, as well as when it expires.
      def with_bill
        t = Customers::BillToken.read(params[:token])
        business = t && Tenancy::Context.unscoped { Business.where.not(status: "deleted").find_by(id: t[:business_id]) }
        return link_invalid unless business
        Tenancy::Context.with(business) do
          customer = Customer.active.find_by(id: t[:customer_id])
          return link_invalid unless customer
          yield customer, Customers::Bill.build(customer, from: t[:from], to: t[:to], due_on: t[:due_on])
        end
      end

      def link_invalid
        render json: { error: { code: "bill.link_invalid", message: "This bill link has expired or is not valid. Ask the shop to send it again." } }, status: :not_found
      end
    end
  end
end
