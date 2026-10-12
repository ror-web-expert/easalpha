module Customers
  # Customer search by a name or a number, for the till's search box and the admin lists.
  #   "#12"        khata no. 12 only
  #   "12", "345"  khata no. (exact), roll no., or a phone or guardian phone containing the digits
  #   "0300 12"    a phone or guardian phone containing it (typed with or without 0, 92 or +92), or a roll no.
  #   "ali c-7"    every word in the name, roll no., room, guardian, company or email
  # call ranks exact khata and roll numbers first, then names starting with what was typed, then the rest by name.
  module Search
    module_function

    TEXT_COLUMNS = %w[name member_no room guardian_name company email].freeze

    def scope(q, base = Customer.active)
      q = q.to_s.strip
      return base.none if q.blank?
      digits = q.gsub(/\D/, "")
      return base.where(khata_no: digits.to_i) if q.match?(/\A#\s*\d+\z/)
      if number?(q)
        conds = [ "customers.member_no ILIKE :roll" ]
        binds = { roll: like(q) }
        if khata_like?(q, digits)
          conds << "customers.khata_no = :k"
          binds[:k] = digits.to_i
        end
        local = local_digits(digits)
        if local.length >= 3
          conds << "customers.phone LIKE :p" << "customers.guardian_phone LIKE :p"
          binds[:p] = "%#{local}%"
        end
        return base.where(conds.join(" OR "), binds)
      end
      q.split(/\s+/).first(5).reduce(base) do |s, word|
        s.where(TEXT_COLUMNS.map { |c| "customers.#{c} ILIKE :w" }.join(" OR "), w: like(word))
      end
    end

    def call(q, limit: 8)
      q = q.to_s.strip
      digits = q.gsub(/\D/, "")
      rank = if number?(q)
        Customer.sanitize_sql_array([ "CASE WHEN customers.khata_no = ? THEN 0 WHEN lower(customers.member_no) = lower(?) THEN 1 ELSE 2 END", khata_like?(q, digits) ? digits.to_i : -1, q ])
      else
        Customer.sanitize_sql_array([ "CASE WHEN lower(customers.member_no) = lower(?) THEN 0 WHEN customers.name ILIKE ? THEN 1 ELSE 2 END", q, "#{Customer.sanitize_sql_like(q)}%" ])
      end
      scope(q, Customer.active.where(is_walk_in: false)).reorder(Arel.sql(rank), :name).limit(limit.to_i.clamp(1, 25))
    end

    def number?(q) = q.match?(/\A[+\d\s\-()]+\z/) && q.match?(/\d/)
    def khata_like?(q, digits) = digits.length <= 7 && !q.start_with?("0", "+")
    # 03001234567, 923001234567 and +923001234567 all become 3001234567, as phones are stored +92...
    def local_digits(digits) = digits.sub(/\A(?:92|0)/, "")
    def like(s) = "%#{Customer.sanitize_sql_like(s)}%"
  end
end
