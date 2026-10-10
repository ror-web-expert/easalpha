# Every business-owned model includes this. Reads and writes are scoped to Current.business.
# Outside a tenant context the scope raises, except inside Tenancy.unscoped { } (super admin, jobs, seeds).
module Tenanted
  extend ActiveSupport::Concern

  class NoTenantError < StandardError; end

  included do
    include Audited
    belongs_to :business
    default_scope do
      if Current.business_id
        where(business_id: Current.business_id)
      elsif Current.allow_unscoped || (Current.allow_unscoped.nil? && Tenancy::Context.default_allow_unscoped)
        all
      else
        raise NoTenantError, "#{name} queried without a business context"
      end
    end
    before_validation { self.business_id ||= Current.business_id }
    validate :business_matches_current

    private

    def business_matches_current
      return if Current.business_id.nil?
      errors.add(:business_id, "does not match the current business") if business_id != Current.business_id
    end
  end
end
