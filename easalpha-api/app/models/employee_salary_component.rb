class EmployeeSalaryComponent < ApplicationRecord
  include Tenanted
  belongs_to :employee
  belongs_to :salary_component

  def amount_for(base_minor)
    if salary_component.is_percent
      (BigDecimal(base_minor.to_s) * (percent || salary_component.percent || 0) / 100).round
    else
      amount_minor || salary_component.default_amount_minor
    end
  end
end
