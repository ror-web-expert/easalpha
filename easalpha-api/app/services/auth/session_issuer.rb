module Auth
  class SessionIssuer
    APPS = %w[admin pos kitchen rider].freeze

    # Builds the response body for any successful login: tokens plus the context the client needs. `refresh_token` is a
    # raw token already issued (POST /auth/refresh hands back the rotation's successor); otherwise a new one is issued.
    # A POS session also gets the key its till signs queued records with (Sync::Signature): the same on every refresh.
    def self.issue(user:, membership:, app:, device: nil, branch: nil, request: nil, refresh_token: nil)
      business = membership.business
      branch ||= device&.branch || business.main_branch
      access = TokenService.access_token(user: user, membership: membership, app: app, device: device, branch: branch)
      refresh = refresh_token || RefreshToken.issue!(user: user, membership: membership, device: device, app: app, user_agent: request&.user_agent, ip: request&.remote_ip)
      user.update_column(:last_login_at, Time.current)
      {
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer",
        expires_in: TokenService::ACCESS_TTL.to_i,
        app: app,
        user: Serializers.user(user),
        business: Serializers.business(business),
        branch: branch && Serializers.branch(branch),
        membership: Serializers.membership(membership),
        permissions: membership.permission_codes,
        modules: Tenancy::Context.with(business) { BusinessModules.all(business) },
        businesses: businesses_of(user)
      }.merge(app.to_s == "pos" ? Sync::Signature.fields_for(refresh) : {})
    end

    # The businesses this person belongs to, with the apps each membership opens, so the admin's switcher offers only
    # the ones it can open (QA of 6 Nov 2026, P4).
    def self.businesses_of(user)
      Membership.all_for_user(user.id).reject { |m| m.business.nil? || m.business.status == "deleted" }.map do |m|
        { id: m.business.id, name: m.business.name, slug: m.business.slug, role: m.role.name, membership_id: m.id, apps: APPS.select { |a| m.can?("app.#{a}") } }
      end
    end
  end
end
