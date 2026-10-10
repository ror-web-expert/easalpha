class ReportMailer < ApplicationMailer
  def scheduled(to:, subject:, body:)
    @body = body
    mail(to: to, subject: subject) { |f| f.text { render plain: body } }
  end
end
