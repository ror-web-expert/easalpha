module Reports
  # SPEC Rider Reports and the Delivery Riders report: deliveries and charges per rider, assigned against completed,
  # failed, cash collected, average minutes to deliver.
  module Riders
    module_function

    def run(branch:, from:, to:)
      scope = Delivery.where(branch_id: branch.id).joins(:order).where(orders: { business_day: from..to }).where.not(rider_id: nil).includes(:rider)
      counts = DeliverySerializers.rider_counts(scope.map(&:rider_id).uniq)
      rows = scope.group_by(&:rider_id).map do |rid, ds|
        rider = ds.first.rider
        delivered = ds.select { |d| d.status == "delivered" }
        times = delivered.filter_map { |d| d.assigned_at && d.delivered_at ? ((d.delivered_at - d.assigned_at) / 60).round : nil }
        { rider: DeliverySerializers.rider(rider, counts: counts), assigned: ds.size, completed: delivered.size, failed: ds.count { |d| d.status == "failed" }, open: ds.count { |d| d.status.in?(%w[assigned picked_up on_the_way arrived]) },
          charges_minor: delivered.sum { |d| d.charge_minor.to_i }, rider_pay_minor: delivered.size * rider.charge_per_delivery_minor, cash_collected_minor: delivered.sum { |d| d.cash_collected_minor.to_i },
          order_value_minor: delivered.sum { |d| d.order.total_minor }, avg_minutes: times.empty? ? nil : (times.sum / times.size), float_minor: rider.float_minor, temporary: rider.temporary }
      end.sort_by { |r| -r[:completed] }
      { from: from, to: to, rows: rows,
        totals: { assigned: rows.sum { |r| r[:assigned] }, completed: rows.sum { |r| r[:completed] }, failed: rows.sum { |r| r[:failed] }, charges_minor: rows.sum { |r| r[:charges_minor] },
                  rider_pay_minor: rows.sum { |r| r[:rider_pay_minor] }, cash_collected_minor: rows.sum { |r| r[:cash_collected_minor] }, riders: rows.size, temporary_riders: rows.count { |r| r[:temporary] } } }
    end
  end
end
