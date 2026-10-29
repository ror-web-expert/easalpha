module Canteen
  # Workers are employees (the fingerprint lives there) and customers (the ledger lives there); this joins the two.
  module Workers
    module_function

    # The customer record this worker's meals go on, made on first use. A customer already carrying the worker's phone
    # is reused unless another worker already owns it.
    def link!(employee)
      if employee.customer_id && (customer = Customer.find_by(id: employee.customer_id))
        return customer
      end
      existing = employee.phone.present? ? Customer.active.find_by(phone: employee.phone) : nil
      existing = nil if existing && (existing.is_walk_in || Employee.where(customer_id: existing.id).where.not(id: employee.id).exists?)
      customer = existing || Customer.create!(name: employee.name, phone: (employee.phone if employee.phone.present? && !Customer.active.exists?(phone: employee.phone)),
                                              source: "in_store", company: employee.department&.name, member_no: employee.cnic.presence, notes: "Canteen worker")
      employee.update!(customer_id: customer.id)
      customer
    end

    # Links every active worker who has no account yet; returns how many.
    def link_all!
      count = 0
      Employee.active.where(customer_id: nil).find_each { |e| link!(e); count += 1 }
      count
    end

    def find_by_fingerprint(fingerprint_id)
      return nil if fingerprint_id.blank?
      Employee.active.find_by(fingerprint_id: fingerprint_id.to_s, fingerprint_revoked_at: nil)
    end

    # When the reader fails: by name, or by the digits of a phone or CNIC.
    def search(q, limit: 20)
      q = q.to_s.strip
      return Employee.none if q.blank?
      digits = q.delete("^0-9")
      scope = Employee.active.includes(:department)
      if digits.length >= 4 && digits.length >= q.length - 4
        tail = digits.sub(/\A0/, "")
        scope.where("employees.phone LIKE :p OR replace(employees.cnic, '-', '') LIKE :p", p: "%#{tail}%")
      else
        scope.where("employees.name ILIKE ?", "%#{q}%")
      end.order(:name).limit(limit)
    end
  end
end
