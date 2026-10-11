module Tenancy
  module Context
    module_function

    # Run a block as a business: sets Current and the RLS session variable, resets after.
    def with(business, branch: nil, user: nil, membership: nil, device: nil, app: nil)
      previous = Current.attributes
      Current.business = business
      Current.branch = branch
      Current.user = user
      Current.membership = membership
      Current.device = device
      Current.app = app
      Current.allow_unscoped = false
      EasAlpha::Rls.set_business!(ActiveRecord::Base.connection, business.id)
      yield
    ensure
      EasAlpha::Rls.reset!(ActiveRecord::Base.connection)
      Current.attributes = previous
    end

    # Tests run unscoped by default; a spec can switch strict mode on to prove the guard.
    def default_allow_unscoped
      @default_allow_unscoped.nil? ? Rails.env.test? : @default_allow_unscoped
    end

    def default_allow_unscoped=(v)
      @default_allow_unscoped = v
    end

    def unscoped
      previous = Current.allow_unscoped
      Current.allow_unscoped = true
      yield
    ensure
      Current.allow_unscoped = previous
    end
  end
end
