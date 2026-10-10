module Deliveries
  # One delivery record per delivery order: zone and charge from the address, rider assignment, status chips, cash collected. Delivered never closes the order.
  module Manager
    module_function

    def ensure_for!(order)
      return nil unless order.order_type == "delivery"
      Delivery.find_by(order_id: order.id) || begin
        address = order.address_id && CustomerAddress.find_by(id: order.address_id)
        zone = address && DeliveryZone.for_address(branch_id: order.branch_id, text: [address.area, address.city, address.line1].compact.join(" "))
        Delivery.create!(branch_id: order.branch_id, order: order, rider_id: order.rider_id, zone: zone, address_id: order.address_id, charge_minor: order.delivery_charge_minor,
                         status: order.rider_id ? "assigned" : "unassigned", assigned_at: order.rider_id && Time.current)
      end
    end

    # Zone lookup for the till before placing: charge and minimum order for an address text.
    def quote(branch:, text:)
      zone = DeliveryZone.for_address(branch_id: branch.id, text: text)
      { zone: zone && DeliverySerializers.zone(zone), charge_minor: zone&.charge_minor || 0, min_order_minor: zone&.min_order_minor || 0, eta_minutes: zone&.eta_minutes }
    end

    def assign!(delivery, rider:, actor:)
      raise Api::Errors::Conflict.new("delivery.status", "Delivery is #{delivery.status}") unless delivery.can_move_to?("assigned") || delivery.status == "assigned"
      raise Api::Errors::Conflict.new("rider.inactive", "#{rider.name} is not active") unless rider.active
      raise Api::Errors::Conflict.new("rider.expired", "#{rider.name} is a temporary rider whose lifetime (#{rider.lifetime_label}) is over") if rider.expired?
      Delivery.transaction do
        delivery.update!(rider: rider, status: "assigned", assigned_at: Time.current, failed_reason: nil)
        delivery.order.update_columns(rider_id: rider.id)
        delivery.events.create!(status: "assigned", by_membership_id: actor&.id, occurred_at: Time.current, note: rider.name)
        rider.update!(status: "busy") if rider.status == "available"
      end
      Realtime.order_changed(delivery.order)
      delivery
    end

    def unassign!(delivery, actor:)
      Delivery.transaction do
        delivery.update!(rider: nil, status: "unassigned", assigned_at: nil)
        delivery.order.update_columns(rider_id: nil)
        delivery.events.create!(status: "unassigned", by_membership_id: actor&.id, occurred_at: Time.current)
      end
      delivery
    end

    def move!(delivery, to:, actor:, lat: nil, lng: nil, note: nil, cash_collected_minor: nil, occurred_at: Time.current)
      raise Api::Errors::Conflict.new("delivery.status", "Cannot go from #{delivery.status} to #{to}") unless delivery.can_move_to?(to)
      Delivery.transaction do
        attrs = { status: to }
        attrs[:picked_up_at] = occurred_at if to == "picked_up"
        attrs[:delivered_at] = occurred_at if to == "delivered"
        attrs[:failed_reason] = note if to == "failed"
        attrs[:cash_collected_minor] = cash_collected_minor if cash_collected_minor
        delivery.update!(attrs)
        delivery.events.create!(status: to, lat: lat, lng: lng, note: note, by_membership_id: actor&.id, occurred_at: occurred_at)
        delivery.rider&.update!(last_lat: lat, last_lng: lng, last_seen_at: occurred_at) if lat && lng
        if to.in?(%w[delivered failed]) && delivery.rider && !Delivery.where(rider_id: delivery.rider_id, status: %w[assigned picked_up on_the_way arrived]).where.not(id: delivery.id).exists?
          delivery.rider.update!(status: "available")
        end
        Rider.where(id: delivery.rider_id).update_all("orders_used = orders_used + 1") if to == "delivered" && delivery.rider&.temporary
        order = delivery.order
        if to == "picked_up" && order.status.in?(%w[placed preparing ready])
          Orders::Transitions.serve!(order, actor: actor) # dispatched; the cashier still closes it at the till
        end
      end
      Realtime.order_changed(delivery.order)
      delivery
    end

    def failed_by_void!(order)
      d = Delivery.find_by(order_id: order.id)
      return unless d && !d.status.in?(%w[delivered failed])
      d.update!(status: "failed", failed_reason: "order voided")
      d.events.create!(status: "failed", note: "order voided", occurred_at: Time.current)
    end
  end
end
