module Reservations
  # Table reservations with a deposit, conflict check, seating onto a table and WhatsApp reminders.
  module Manager
    module_function

    def create!(attrs, actor:, branch:)
      starts = Time.iso8601(attrs[:starts_at].to_s)
      ends = attrs[:ends_at].present? ? Time.iso8601(attrs[:ends_at].to_s) : starts + (attrs[:duration_minutes].presence || 90).to_i.minutes
      table = attrs[:table_id].present? ? DiningTable.active.find(attrs[:table_id]) : nil
      customer = attrs[:customer_id].present? ? Customer.active.find(attrs[:customer_id]) : nil
      r = Reservation.new(branch: branch, table: table, customer: customer, guest_name: attrs[:guest_name].presence || customer&.name, phone: attrs[:phone].presence || customer&.phone, party_size: attrs[:party_size].presence || 2,
                          starts_at: starts, ends_at: ends, deposit_minor: attrs[:deposit_minor].to_i, notes: attrs[:notes], by_membership_id: actor&.id, status: "booked")
      check_conflict!(r)
      # A deposit is held on the customer's khata, which only exists while customer accounts are on.
      BusinessModules.require!(branch.business, "customer_accounts") if r.deposit_minor.positive?
      Reservation.transaction do
        r.save!
        if r.deposit_minor.positive? && customer && attrs[:deposit_method_code].present?
          cp = Payments::Khata.receive!(customer, amount_minor: r.deposit_minor, method_code: attrs[:deposit_method_code], reference: "Reservation deposit", actor: actor, branch: branch, direction: "received")
          r.update!(deposit_payment_id: cp.id)
        end
      end
      if r.phone.present?
        Whatsapp::Sender.deliver(phone: r.phone, template: "reservation_confirmed", customer_id: customer&.id, variables: { name: r.guest_name, when: r.starts_at.in_time_zone(branch.time_zone).strftime("%a %d %b %I:%M %p"), party: r.party_size, table: table&.code })
      end
      r
    end

    def check_conflict!(r)
      return unless r.table_id
      others = Reservation.live.where(table_id: r.table_id).where.not(id: r.id)
      raise Api::Errors::Conflict.new("reservation.table_busy", "Table #{r.table.code} is already reserved for that time") if r.overlaps?(others)
    end

    def update!(r, attrs)
      raise Api::Errors::Conflict.new("reservation.status", "Reservation is #{r.status}") unless r.status.in?(%w[booked confirmed])
      r.assign_attributes(attrs.slice(:guest_name, :phone, :party_size, :notes, :table_id, :deposit_minor))
      BusinessModules.require!(r.branch.business, "customer_accounts") if r.deposit_minor_changed? && r.deposit_minor.positive?
      r.starts_at = Time.iso8601(attrs[:starts_at].to_s) if attrs[:starts_at].present?
      r.ends_at = Time.iso8601(attrs[:ends_at].to_s) if attrs[:ends_at].present?
      check_conflict!(r)
      r.save!
      r
    end

    # Seats the party: occupies the table and opens a dine-in order so the deposit can be applied at payment.
    def seat!(r, actor:, table_id: nil, open_order: true)
      raise Api::Errors::Conflict.new("reservation.status", "Reservation is #{r.status}") unless r.status.in?(%w[booked confirmed])
      table = table_id.present? ? DiningTable.active.find(table_id) : r.table
      raise Api::Errors::BadRequest.new("reservation.table", "Choose a table to seat the party") unless table
      raise Api::Errors::Conflict.new("table.occupied", "Table #{table.code} has an open order") if table.current_order_id && Order.open.where(id: table.current_order_id).exists?
      order = nil
      Reservation.transaction do
        if open_order
          builder = Orders::Builder.create!({ order_type: "dine_in", table_id: table.id, guest_name: r.guest_name, customer_id: r.customer_id, covers: r.party_size, notes: r.notes.presence }, lines: [], actor: actor, device: nil, branch: r.branch)
          order = builder.order
        else
          table.occupy!(Order.new(id: nil)) if false
        end
        r.update!(status: "seated", seated_at: Time.current, table: table, order_id: order&.id)
      end
      r
    end

    def mark!(r, status, actor: nil)
      raise Api::Errors::Conflict.new("reservation.status", "Cannot mark a #{r.status} reservation as #{status}") unless (r.status.in?(%w[booked confirmed]) && status.in?(%w[confirmed no_show cancelled])) || (r.status == "seated" && status == "completed")
      r.update!(status: status)
      AuditLog.record(action: "reservation_#{status}", record: r)
      r
    end

    def availability(branch:, starts_at:, ends_at:, party_size: nil)
      busy = Reservation.live.where(branch_id: branch.id).where("starts_at < ? AND ends_at > ?", ends_at, starts_at).pluck(:table_id).compact
      tables = DiningTable.active.where(branch_id: branch.id).where.not(id: busy).order(:code)
      tables = tables.where("seats >= ?", party_size) if party_size
      tables
    end

    # Reminders two hours before, once.
    def send_reminders!(window: 2.hours)
      count = 0
      Reservation.where(status: %w[booked confirmed], reminder_sent_at: nil).where(starts_at: Time.current..(Time.current + window)).where.not(phone: nil).find_each do |r|
        Whatsapp::Sender.deliver(phone: r.phone, template: "reservation_reminder", customer_id: r.customer_id, variables: { name: r.guest_name, when: r.starts_at.in_time_zone(r.branch.time_zone).strftime("%I:%M %p"), party: r.party_size })
        r.update_columns(reminder_sent_at: Time.current)
        count += 1
      end
      count
    end
  end
end
