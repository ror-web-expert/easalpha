module Billing
  # Trial reminders, trial end, grace and read-only. Runs daily per business. Plans and prices live in the database.
  module Lifecycle
    module_function

    REMINDER_DAYS = { 60 => :trial_reminder_60_at, 80 => :trial_reminder_80_at, 88 => :trial_reminder_88_at }.freeze
    GRACE_DAYS = 7
    DATA_RETENTION_DAYS = 60

    def run_for(business, today: Date.current)
      Tenancy::Context.with(business) do
        case business.status
        when "trial" then trial_step(business, today)
        when "active" then active_step(business, today)
        when "grace" then grace_step(business, today)
        when "read_only" then read_only_step(business, today)
        end
      end
    end

    def trial_step(business, today)
      return unless business.trial_ends_on
      elapsed = Business::TRIAL_DAYS - (business.trial_ends_on - today).to_i
      REMINDER_DAYS.each do |day, column|
        next if elapsed < day || business.public_send(column)
        days_left = (business.trial_ends_on - today).to_i
        notify_owners(business, "trial_reminder", { business_name: business.name, days: days_left, ends_on: business.trial_ends_on.to_s }, title: "Trial ends in #{days_left} days", link: "/settings/billing")
        business.update_column(column, Time.current)
      end
      make_read_only!(business, reason: "trial ended") if today > business.trial_ends_on && !paid_subscription?(business)
    end

    def active_step(business, today)
      sub = business.subscriptions.order(created_at: :desc).first
      return unless sub && sub.current_period_end && sub.current_period_end.to_date < today
      overdue = Invoice.unpaid.where(subscription_id: sub.id).exists?
      return business.update!(status: "grace") && sub.update!(status: "grace", grace_ends_on: today + GRACE_DAYS) && notify_owners(business, "invoice_due", { business_name: business.name, number: Invoice.unpaid.last&.number, amount: Invoice.unpaid.last&.amount_minor.to_i / 100, due_on: (today + GRACE_DAYS).to_s }, title: "Payment overdue", link: "/settings/billing") if overdue
      Issuer.issue_period!(business, sub)
    end

    def grace_step(business, today)
      sub = business.subscriptions.order(created_at: :desc).first
      return unless sub&.grace_ends_on && today > sub.grace_ends_on
      make_read_only!(business, reason: "payment overdue")
    end

    def read_only_step(business, today)
      return unless business.read_only_at && today > business.read_only_at.to_date + DATA_RETENTION_DAYS
      Notification.create!(kind: "data_deletion_warning", title: "Data will be deleted", body: "Your account has been read-only for #{DATA_RETENTION_DAYS} days. Renew now or export your data; deletion follows a final warning.", link: "/settings/billing") unless Notification.exists?(kind: "data_deletion_warning")
    end

    def make_read_only!(business, reason:)
      business.update!(status: "read_only", read_only_at: Time.current)
      business.subscriptions.order(created_at: :desc).first&.update!(status: "read_only")
      notify_owners(business, "account_read_only", { business_name: business.name }, title: "Account is read-only (#{reason})", link: "/settings/billing")
      AuditLog.record(action: "settings_change", record: business, after: { status: "read_only", reason: reason }, business: business)
    end

    def activate!(business, plan:, cycle:, tills: 1)
      sub = business.subscriptions.order(created_at: :desc).first || Subscription.new(business: business)
      period_end = cycle == "yearly" ? 12.months.from_now : 1.month.from_now
      period_end += 1.month if business.trial? && cycle == "yearly" && business.trial_ends_on && Date.current <= business.trial_ends_on
      sub.assign_attributes(plan: plan, billing_cycle: cycle, status: "active", current_period_start: Time.current, current_period_end: period_end, grace_ends_on: nil, tills: tills)
      sub.save!
      business.update!(status: "active", plan: plan, read_only_at: nil)
      AuditLog.record(action: "settings_change", record: business, after: { status: "active", plan: plan.code, cycle: cycle }, business: business)
      sub
    end

    def paid_subscription?(business)
      business.subscriptions.where(status: "active").where("current_period_end >= ?", Time.current).exists?
    end

    def notify_owners(business, template, variables, title:, link:)
      Notification.create!(kind: template, title: title, body: variables[:summary] || title, link: link)
      Membership.active.joins(:role).where(roles: { system_key: "owner" }).includes(:user).each do |m|
        Whatsapp::Sender.deliver(phone: m.user.phone, template: template, variables: variables, counted: false) if m.user.phone.present?
      end
    end

    def usage(business)
      plan = business.plan
      month = Time.current.beginning_of_month
      { plan: plan && { code: plan.code, name: plan.name, limits: plan.limits, features: plan.features },
        staff: { used: Membership.active.count, limit: plan&.limits&.dig("staff") }, tills: { used: Device.active.where(kind: %w[till tablet]).count, limit: plan&.limits&.dig("tills") },
        branches: { used: Branch.active.count, limit: plan&.limits&.dig("branches") },
        whatsapp_utility: { used: WhatsappMessage.where(business_id: business.id, counted_against_plan: true).where("created_at >= ?", month).count, limit: plan&.limits&.dig("whatsapp_utility_messages"), credits: business.whatsapp_credits } }
    end
  end
end
