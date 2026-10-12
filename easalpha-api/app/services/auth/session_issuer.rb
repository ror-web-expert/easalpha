module Auth
  class SessionIssuer
    # Builds the response body for any successful login: tokens plus the context the client needs.
    def self.issue(user:, membership:, app:, device: nil, branch: nil, request: nil)
      business = membership.business
      branch ||= device&.branch || business.main_branch
      access = TokenService.access_token(user: user, membership: membership, app: app, device: device, branch: branch)
      refresh = RefreshToken.issue!(user: user, membership: membership, device: device, app: app, user_agent: request&.user_agent, ip: request&.remote_ip)
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
        businesses: Membership.all_for_user(user.id).map { |m| { id: m.business.id, name: m.business.name, slug: m.business.slug, role: m.role.name, membership_id: m.id } }
      }
    end
  end
end
