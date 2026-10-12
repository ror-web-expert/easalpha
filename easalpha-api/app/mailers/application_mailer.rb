class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "EasAlpha <no-reply@easalpha.com>") }
  layout "mailer"

  # True when the server can send mail (SMTP_* in deploy/.env) or when a test is capturing deliveries.
  def self.enabled? = ENV["SMTP_ADDRESS"].present? || Rails.env.test?
end
