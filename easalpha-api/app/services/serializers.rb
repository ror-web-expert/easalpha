# Plain hash serializers. One place so every endpoint returns the same shape for the same record.
module Serializers
  module_function

  def user(u)
    { id: u.id, name: u.name, email: u.email, phone: u.phone, locale: u.locale, two_factor_enabled: u.two_factor_enabled, last_login_at: u.last_login_at,
      phone_verified: u.verified?(:phone), email_verified: u.verified?(:email) }
  end

  def business(b)
    { id: b.id, name: b.name, slug: b.slug, legal_name: b.legal_name, country: b.country, currency: b.currency, time_zone: b.time_zone,
      phone: b.phone, email: b.email, logo_key: b.logo_key, status: b.status, trial_ends_on: b.trial_ends_on, trial_days_left: b.trial_days_left,
      plan: b.plan && { code: b.plan.code, name: b.plan.name, features: b.plan.features, limits: b.plan.limits },
      settings: Setting.without_secrets(b.settings), settings_version: b.settings_version, read_only: b.read_only?, created_at: b.created_at }
  end

  # tax: :public (every till, session and receipt) carries the registration numbers only; :manage (the branch
  # screens, for settings.manage) adds whether an API token is saved. The token itself is never serialized (S1).
  def branch(br, tax: :public)
    { id: br.id, business_id: br.business_id, name: br.name, code: br.code, address: br.address, city: br.city, phone: br.phone,
      time_zone: br.time_zone, day_end_time: br.day_end_time&.strftime("%H:%M"), business_day_start: br.business_day_start&.strftime("%H:%M"),
      business_day_window: br.business_day_window, tax_registration: tax == :manage ? br.masked_tax_registration : br.public_tax_registration,
      opening_hours: br.opening_hours, qr_settings: br.qr_config, is_main: br.is_main, archived_at: br.archived_at }
  end

  def membership(m, include_user: true)
    h = { id: m.id, business_id: m.business_id, user_id: m.user_id, role: { id: m.role.id, name: m.role.name, system_key: m.role.system_key },
          status: m.status, all_branches: m.all_branches, branch_ids: m.branch_ids, has_pin: m.pin_digest.present?,
          pin_locked: m.pin_locked?, invited_via: m.invited_via, permissions_mode: m.permissions_mode, staff_type: m.staff_type, cashier_role: m.cashier_role,
          created_at: m.created_at, deactivated_at: m.deactivated_at }
    h[:user] = user(m.user) if include_user
    h
  end

  # A member as a colleague sees them: the name and the role, for the pickers of stock counts, checklists and
  # commissions. Contact details, sign-in times and PIN state are for staff.manage or the member themself (QA of 6 Nov
  # 2026, P7: GET /staff gave them to every token, the rider's and the kitchen's too).
  def membership_listing(m)
    { id: m.id, business_id: m.business_id, user_id: m.user_id, role: { id: m.role.id, name: m.role.name, system_key: m.role.system_key },
      status: m.status, all_branches: m.all_branches, branch_ids: m.branch_ids, staff_type: m.staff_type, cashier_role: m.cashier_role,
      user: { id: m.user.id, name: m.user.name } }
  end

  # url: the link the owner may copy and send; it opens nothing without the code that goes to the phone or email.
  def staff_invitation(i)
    { id: i.id, name: i.name, phone: i.phone, email: i.email, role: { id: i.role.id, name: i.role.name, system_key: i.role.system_key },
      staff_type: i.staff_type, cashier_role: i.cashier_role, has_pin: i.pin_digest.present?, status: i.status, expires_at: i.expires_at,
      created_at: i.created_at, url: i.url, rider_id: i.rider_id }
  end

  def role(r)
    { id: r.id, name: r.name, system_key: r.system_key, is_system: r.is_system, copied_from_role_id: r.copied_from_role_id,
      permissions: r.role_permissions.map { |rp| { code: rp.permission_code, limit: rp.limit_value } }, archived_at: r.archived_at }
  end

  def device(d, include_code: false)
    h = { id: d.id, branch_id: d.branch_id, name: d.name, code: d.code, kind: d.kind, station_id: d.station_id, paired: d.paired?,
          paired_at: d.paired_at, platform: d.platform, app_version: d.app_version, last_sync_at: d.last_sync_at, last_seen_at: d.last_seen_at, revoked_at: d.revoked_at }
    h[:pairing_code] = d.pairing_code if include_code
    h[:pairing_expires_at] = d.pairing_expires_at if include_code
    h
  end

  # SPEC User Sessions: one row per sign-in, from the refresh token it issued.
  def user_session(rt, membership: nil)
    m = membership || rt.membership
    { id: rt.id, membership_id: rt.membership_id, user_id: rt.user_id, name: m&.user&.name, staff_type: m&.staff_type, app: rt.app,
      device_id: rt.device_id, device: rt.device&.code, ip: rt.ip, user_agent: rt.user_agent, signed_in_at: rt.created_at,
      signed_out_at: rt.revoked_at, expires_at: rt.expires_at, active: rt.revoked_at.nil? && rt.expires_at > Time.current }
  end

  # A row EasAlpha support wrote on an approved session names the support person (super_admin_id), not the owner;
  # before and after are redacted again on the way out, for rows written before AuditLog.redact existed (S1).
  def audit_log(a, names: {}, support_names: {})
    actor = a.super_admin_id ? "EasAlpha support (#{support_names[a.super_admin_id] || 'staff'})" : names[a.user_id]
    { id: a.id, action: a.action, table_name: a.table_name, entity: AuditLog.entity_label(a.table_name), record_id: a.record_id, user_id: a.user_id, user_name: actor, super_admin_id: a.super_admin_id,
      device_id: a.device_id, approved_by_user_id: a.approved_by_user_id, approved_by_name: names[a.approved_by_user_id],
      before: AuditLog.redact(a.before), after: AuditLog.redact(a.after), ip: a.ip, occurred_at: a.occurred_at }
  end

  def checklist_item(i)
    { id: i.id, key: i.key, title: i.title, done: i.done_at.present?, done_at: i.done_at, plan_feature_off: i.plan_feature_off, sort_order: i.sort_order }
  end

  def notification(n)
    { id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read_at: n.read_at, created_at: n.created_at }
  end
end
