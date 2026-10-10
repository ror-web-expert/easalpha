module Api
  module V1
    class BillingController < BaseController
      before_action -> { require_permission!("billing.manage", "settings.manage") }

      def show
        sub = Subscription.order(created_at: :desc).first
        render json: {
          business: Serializers.business(current_business), subscription: sub && subscription(sub),
          plans: Plan.active.order(:sort_order).map { |p| { code: p.code, name: p.name, price_pkr_minor: p.price_pkr_minor, price_usd_minor: p.price_usd_minor, limits: p.limits, features: p.features } },
          invoices: Invoice.order(created_at: :desc).limit(24).map { |i| invoice(i) }, usage: Billing::Lifecycle.usage(current_business),
          payment_instructions: current_business.country == "PK" ? { jazzcash: ENV["BILLING_JAZZCASH"], easypaisa: ENV["BILLING_EASYPAISA"], bank: ENV["BILLING_BANK"] } : { provider: "paddle" }
        }
      end

      # POST /billing/choose_plan  plan_code, cycle (monthly|yearly), tills
      def choose_plan
        plan = Plan.active.find_by!(code: params.require(:plan_code))
        cycle = params[:cycle].presence_in(%w[monthly yearly]) || "monthly"
        tills = [ params[:tills].to_i, 1 ].max
        sub = Subscription.order(created_at: :desc).first || Subscription.create!(business: current_business, plan: plan, status: "trialing")
        sub.update!(plan: plan, billing_cycle: cycle, tills: tills)
        current_business.update!(plan: plan) if current_business.trial?
        inv = Billing::Issuer.issue!(current_business, plan: plan, cycle: cycle, tills: tills, subscription: sub)
        audit!("settings_change", record: current_business, after: { plan: plan.code, cycle: cycle, invoice: inv.number })
        render json: { invoice: invoice(inv), subscription: subscription(sub) }, status: :created
      end

      # POST /billing/invoices/:id/report_payment  method, reference  (owner tells us they paid; Servio confirms)
      def report_payment
        inv = Invoice.unpaid.find(params[:id])
        inv.update!(status: "reported", payment_method: params.require(:method), payment_reference: params.require(:reference), reported_at: Time.current)
        audit!("update", record: inv, after: { reported: true, method: inv.payment_method, reference: inv.payment_reference })
        render json: invoice(inv)
      end

      def export
        render json: { message: "Export is prepared in the background and sent to the owner's email", kinds: %w[menu orders customers stock] }
      end

      private

      def subscription(s)
        { id: s.id, plan_code: s.plan.code, plan_name: s.plan.name, billing_cycle: s.billing_cycle, status: s.status, current_period_start: s.current_period_start, current_period_end: s.current_period_end, grace_ends_on: s.grace_ends_on, tills: s.tills, provider: s.provider }
      end

      def invoice(i)
        { id: i.id, number: i.number, amount_minor: i.amount_minor, currency: i.currency, due_on: i.due_on, status: i.status, period_label: i.period_label, lines: i.lines,
          payment_method: i.payment_method, payment_reference: i.payment_reference, reported_at: i.reported_at, confirmed_at: i.confirmed_at, created_at: i.created_at }
      end
    end
  end
end
