# The one email a new business owner gets after /auth/signup: where to log in, what to do first, how to reach us.
class WelcomeMailer < ApplicationMailer
  def signup(user:, business:)
    @user = user
    @business = business
    @site = ENV.fetch("PUBLIC_URL", "https://easalpha.com")
    @support = ENV.fetch("SUPPORT_EMAIL", "hello@easalpha.com")
    @trial_ends = business.trial_ends_on
    mail(to: user.email, subject: "Welcome to EasAlpha, #{business.name} is ready")
  end
end
