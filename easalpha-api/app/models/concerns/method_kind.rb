# Payments, refunds and account payments picked by the kind of their method (cash, khata), never by its code: a
# business can add a second method of a kind, and every figure counts it with the first.
module MethodKind
  extend ActiveSupport::Concern

  included do
    scope :by_method_kind, ->(kind) { where(payment_method_id: PaymentMethod.where(kind: kind).select(:id)) }
  end
end
