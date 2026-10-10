module Auth
  # Creates a user, a business on the Pro trial, its main branch, the seven default roles,
  # the owner membership and the setup checklist.
  class Signup
    Result = Struct.new(:user, :business, :membership, :branch, keyword_init: true)

    def self.call(name:, business_name:, email: nil, phone: nil, password: nil, country: "PK", currency: "PKR", time_zone: "Asia/Karachi", locale: "en")
      ActiveRecord::Base.transaction do
        user = User.create!(name: name, email: email, phone: phone, password: password, locale: locale)
        plan = Plan.find_by(code: "pro") || Plan.seed! && Plan.find_by!(code: "pro")
        business = Business.create!(
          name: business_name, slug: Business.generate_slug(business_name), country: country, currency: currency,
          time_zone: time_zone, phone: phone, email: email, plan: plan, trial_ends_on: Business::TRIAL_DAYS.days.from_now.to_date, status: "trial"
        )
        Tenancy::Context.with(business) do
          branch = Branch.create!(business: business, name: "Main", code: "B1", time_zone: time_zone, is_main: true)
          roles = RoleTemplate.create_for(business)
          owner_role = roles.find(&:owner?)
          membership = Membership.create!(business: business, user: user, role: owner_role, status: "active", all_branches: true)
          Subscription.create!(business: business, plan: plan, status: "trialing", current_period_start: Time.current, current_period_end: business.trial_ends_on.end_of_day)
          SetupChecklistItem.create_defaults_for(business)
          Customer.walk_in
          PaymentMethod.seed_defaults!(business)
          Current.user = user
          AuditLog.record(action: "create", record: business, after: { name: business.name, plan: plan.code }, business: business)
          Result.new(user: user, business: business, membership: membership, branch: branch)
        end
      end
    end
  end
end
