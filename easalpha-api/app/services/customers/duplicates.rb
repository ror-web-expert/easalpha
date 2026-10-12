module Customers
  # Customers who may be the person being added: same phone, same roll or ID number, same guardian phone, the same
  # name written differently (case, spaces, dots), or a name holding every word typed. Up to eight, strongest first.
  module Duplicates
    module_function

    def find(name: nil, phone: nil, member_no: nil, guardian_phone: nil, exclude_id: nil)
      found = {}
      add = lambda do |scope, reason|
        scope.where.not(id: exclude_id.presence).limit(8).each do |c|
          h = (found[c.id] ||= { customer: c, reasons: [] })
          h[:reasons] << reason unless reason == "Similar name" && h[:reasons].include?("Same name")
        end
      end
      base = Customer.active.where(is_walk_in: false)
      if (p = User.normalize_phone(phone.to_s)).present?
        add.call(base.where(phone: p), "Same phone")
        add.call(base.where(guardian_phone: p), "Phone is another customer's guardian phone")
      end
      add.call(base.where("lower(member_no) = ?", member_no.to_s.strip.downcase), "Same roll or ID number") if member_no.to_s.strip.present?
      if (g = User.normalize_phone(guardian_phone.to_s)).present?
        add.call(base.where(guardian_phone: g).or(base.where(phone: g)), "Same guardian phone")
      end
      key = normalize(name)
      if key.length >= 3
        add.call(base.where("regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = ?", key), "Same name")
        words = name.to_s.downcase.scan(/[a-z0-9]+/).select { |w| w.length >= 2 }.uniq
        if words.size >= 2
          similar = words.reduce(base) { |s, w| s.where("lower(name) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(w)}%") }
          add.call(similar, "Similar name")
        end
      end
      found.values.sort_by { |h| -h[:reasons].size }.first(8).map do |h|
        c = h[:customer]
        { id: c.id, name: c.name, khata_no: c.khata_no, phone: c.phone, member_no: c.member_no, room: c.room, guardian_name: c.guardian_name, guardian_phone: c.guardian_phone,
          balance_minor: c.balance_minor, last_order_at: c.last_order_at, reasons: h[:reasons].uniq }
      end
    end

    def normalize(s) = s.to_s.downcase.gsub(/[^a-z0-9]/, "")
  end
end
