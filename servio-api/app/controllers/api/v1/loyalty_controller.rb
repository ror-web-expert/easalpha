module Api
  module V1
    class LoyaltyController < BaseController
      before_action :authenticate!

      # GET /loyalty/settings   PATCH /loyalty/settings
      def settings
        require_permission!("settings.manage", "customers.view", "orders.create")
        render json: Loyalty.settings(current_business)
      end

      def update_settings
        require_permission!("settings.manage")
        read_only_guard!
        allowed = params.permit(*Loyalty::DEFAULTS.keys).to_h
        current_business.update!(settings: current_business.settings.merge(allowed))
        audit!("settings_change", record: current_business, after: allowed)
        render json: Loyalty.settings(current_business.reload)
      end

      # GET /customers/:id/loyalty
      def customer
        require_permission!("customers.view", "customers.manage", "orders.create")
        c = Customer.find(params[:id])
        render json: { customer_id: c.id, points: c.loyalty_points, value_minor: c.loyalty_points * Loyalty.settings(current_business)["loyalty_point_value_minor"].to_i, transactions: Loyalty.ledger(c) }
      end

      # POST /customers/:id/loyalty/adjust { points, note }
      def adjust
        require_permission!("customers.manage")
        read_only_guard!
        c = Customer.active.find(params[:id])
        approver = require_approval!("customers.manage")
        t = Loyalty.adjust!(c, points: params.require(:points), note: params[:note], by: current_membership)
        audit!("loyalty_adjust", record: c, after: { points: t.points, note: t.note }, approved_by: approver&.user)
        render json: { points: c.reload.loyalty_points, transaction: { id: t.id, points: t.points, balance_after: t.balance_after } }, status: :created
      end

      # POST /orders/:id/redeem_points { points }
      def redeem
        require_permission!("orders.create")
        read_only_guard!
        order = Order.includes(items: :modifiers).find(params[:id])
        Loyalty.redeem!(order, points: params.require(:points), actor: current_membership)
        audit!("loyalty_redeem", record: order, after: { points: params[:points].to_i })
        render json: OrderSerializers.full(order.reload)
      end
    end
  end
end
