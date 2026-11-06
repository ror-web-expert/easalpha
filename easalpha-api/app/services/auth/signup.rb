module Auth
  # Creates a user, a business on the Business trial (every feature open, as the site promises; the owner picks a plan
  # when it ends), its main branch, the seven default roles, the owner membership and the setup checklist.
  class Signup
    Result = Struct.new(:user, :business, :membership, :branch, keyword_init: true)
    TRIAL_PLAN = "business"

    # The sign-up countries (easalpha-web site-helpers COUNTRIES): dialling code, currency, time zone.
    COUNTRIES = {
      "PK" => [ "92", "PKR", "Asia/Karachi" ], "AE" => [ "971", "AED", "Asia/Dubai" ], "SA" => [ "966", "SAR", "Asia/Riyadh" ],
      "QA" => [ "974", "QAR", "Asia/Qatar" ], "OM" => [ "968", "OMR", "Asia/Muscat" ], "KW" => [ "965", "KWD", "Asia/Kuwait" ],
      "BH" => [ "973", "BHD", "Asia/Bahrain" ], "GB" => [ "44", "GBP", "Europe/London" ], "IE" => [ "353", "EUR", "Europe/Dublin" ],
      "US" => [ "1", "USD", "America/New_York" ], "CA" => [ "1", "CAD", "America/Toronto" ], "AU" => [ "61", "AUD", "Australia/Sydney" ],
      "NZ" => [ "64", "NZD", "Pacific/Auckland" ], "DE" => [ "49", "EUR", "Europe/Berlin" ], "FR" => [ "33", "EUR", "Europe/Paris" ],
      "NL" => [ "31", "EUR", "Europe/Amsterdam" ], "ES" => [ "34", "EUR", "Europe/Madrid" ], "IT" => [ "39", "EUR", "Europe/Rome" ],
      "TR" => [ "90", "TRY", "Europe/Istanbul" ], "EG" => [ "20", "EGP", "Africa/Cairo" ], "NG" => [ "234", "NGN", "Africa/Lagos" ],
      "KE" => [ "254", "KES", "Africa/Nairobi" ], "ZA" => [ "27", "ZAR", "Africa/Johannesburg" ], "IN" => [ "91", "INR", "Asia/Kolkata" ],
      "BD" => [ "880", "BDT", "Asia/Dhaka" ], "LK" => [ "94", "LKR", "Asia/Colombo" ], "NP" => [ "977", "NPR", "Asia/Kathmandu" ],
      "MY" => [ "60", "MYR", "Asia/Kuala_Lumpur" ], "SG" => [ "65", "SGD", "Asia/Singapore" ], "ID" => [ "62", "IDR", "Asia/Jakarta" ],
      "PH" => [ "63", "PHP", "Asia/Manila" ], "TH" => [ "66", "THB", "Asia/Bangkok" ], "JP" => [ "81", "JPY", "Asia/Tokyo" ],
      "BR" => [ "55", "BRL", "America/Sao_Paulo" ], "MX" => [ "52", "MXN", "America/Mexico_City" ]
    }.freeze

    # What the new business starts on when the sign-up leaves something out (S3, 6 Nov 2026: a Pakistani owner with an
    # en-US browser got a US business). The country is the one given, else the phone's dialling code, else the time
    # zone's country, else Pakistan; currency and time zone follow the country unless given. Edited later on Store.
    def self.defaults(country: nil, currency: nil, time_zone: nil, phone: nil)
      code = country.to_s.strip.upcase
      code = nil unless code.match?(/\A[A-Z]{2}\z/)
      code ||= country_for_phone(phone) || COUNTRIES.find { |_, (_, _, zone)| zone == time_zone.to_s }&.first || "PK"
      _, money, zone = COUNTRIES.fetch(code, COUNTRIES["PK"])
      zone = time_zone.to_s if Business.valid_time_zone?(time_zone)
      { country: code, currency: currency.to_s.strip.upcase.presence || (COUNTRIES.key?(code) ? money : "USD"), time_zone: zone }
    end

    # "+923001234567" is PK. +1 is shared by the US and Canada and says nothing, so it is left to the time zone.
    def self.country_for_phone(phone)
      digits = User.normalize_phone(phone).to_s
      return nil unless digits.start_with?("+")
      found = COUNTRIES.select { |_, (dial, _, _)| digits.delete_prefix("+").start_with?(dial) }.max_by { |_, (dial, _, _)| dial.length }
      found && found[1][0] != "1" ? found[0] : nil
    end

    # phone_verified: the phone was signed up with its code. business_phone: the business's own contact number, which
    # stays when the login cannot take the phone (another account has it); it also tells the country.
    def self.call(name:, business_name:, email: nil, phone: nil, password: nil, country: nil, currency: nil, time_zone: nil, locale: "en",
                  phone_verified: false, business_phone: phone)
      country, currency, time_zone = defaults(country: country, currency: currency, time_zone: time_zone, phone: business_phone || phone).values_at(:country, :currency, :time_zone)
      ActiveRecord::Base.transaction do
        user = User.create!(name: name, email: email, phone: phone, password: password, locale: locale, phone_verified_at: phone && phone_verified ? Time.current : nil)
        plan = Plan.find_by(code: TRIAL_PLAN) || Plan.seed! && Plan.find_by!(code: TRIAL_PLAN)
        business = Business.create!(
          name: business_name, slug: Business.generate_slug(business_name), country: country, currency: currency,
          time_zone: time_zone, phone: business_phone, email: email, plan: plan, trial_ends_on: Business::TRIAL_DAYS.days.from_now.to_date, status: "trial"
        )
        # The new owner is the actor of every setup row (branch, roles, payment methods) in the audit log.
        Tenancy::Context.with(business, user: user) do
          branch = Branch.create!(business: business, name: "Main", code: "B1", time_zone: time_zone, is_main: true)
          roles = RoleTemplate.create_for(business)
          owner_role = roles.find(&:owner?)
          membership = Membership.create!(business: business, user: user, role: owner_role, status: "active", all_branches: true)
          Subscription.create!(business: business, plan: plan, status: "trialing", current_period_start: Time.current, current_period_end: business.trial_ends_on.end_of_day)
          SetupChecklistItem.create_defaults_for(business)
          Customer.walk_in
          PaymentMethod.seed_defaults!(business)
          Tenancy::Context.with(business, user: user) { Finance::Chart.seed! }
          AuditLog.record(action: "create", record: business, after: { name: business.name, plan: plan.code }, business: business)
          # After commit so the job finds the rows; skipped on a server with no outgoing mail configured.
          WelcomeMailer.signup(user: user, business: business).deliver_later if email.present? && ApplicationMailer.enabled?
          Result.new(user: user, business: business, membership: membership, branch: branch)
        end
      end
    end
  end
end
