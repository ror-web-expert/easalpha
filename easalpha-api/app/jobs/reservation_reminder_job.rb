# Every 15 minutes: WhatsApp reminders for reservations starting within two hours.
class ReservationReminderJob < ApplicationJob
  queue_as :messages

  def perform
    Tenancy::Context.unscoped { Reservation.where(status: %w[booked confirmed], reminder_sent_at: nil).where(starts_at: Time.current..(Time.current + 2.hours)).distinct.pluck(:business_id) }.each do |bid|
      within_business(bid) { Reservations::Manager.send_reminders! }
    end
  end
end
