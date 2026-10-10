# SPEC Day-End Settlement: clears every closed till of a business day into company cash and records what was cleared,
# so the Cashier Till report's "In tills now" starts again from zero.
class DayEndSettlement < ApplicationRecord
  include Tenanted
  belongs_to :branch
end
