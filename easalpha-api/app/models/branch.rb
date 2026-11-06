class Branch < ApplicationRecord
  include Tenanted

  has_many :devices, dependent: :destroy
  validates :name, :code, :time_zone, :day_end_time, :business_day_start, presence: true
  validates :code, uniqueness: { scope: :business_id }
  validates :time_zone, inclusion: { in: ->(_) { Business::TIME_ZONES }, message: "must be a time zone such as Asia/Karachi" }, if: :will_save_change_to_time_zone?
  scope :active, -> { where(archived_at: nil) }

  before_validation { self.code ||= "B#{Branch.unscoped.where(business_id: business_id).count + 1}" }

  # The code goes into every receipt number (yymmdd-CODE-serial) and its Code 128 barcode, where a space or a
  # non-ASCII letter broke the barcode and the search (review of 6 Nov 2026, R15). A new or changed code is 1 to 8 of
  # A-Z and 0-9, upper-cased as given; a code saved before the rule is never rewritten and keeps working.
  CODE_FORMAT = /\A[A-Z0-9]{1,8}\z/
  before_validation { self.code = code.strip.upcase if code.is_a?(String) && (new_record? || will_save_change_to_code?) }
  validates :code, format: { with: CODE_FORMAT, message: "must be 1 to 8 letters A-Z or digits" }, if: -> { new_record? || will_save_change_to_code? }

  # The business day an instant belongs to. SPEC: the day is a window (default 06:01 to 02:01); anything before the end
  # time belongs to the previous date, so 1:00 am is still yesterday's trade. The start time is informational (top bar,
  # attendance fallback) and never splits a day.
  def business_day_for(time)
    local = time.in_time_zone(time_zone)
    cutoff = local.change(hour: day_end_time.hour, min: day_end_time.min)
    date = local.to_date
    local < cutoff ? date - 1 : date
  end

  def business_day_window = "#{business_day_start.strftime('%H:%M')} to #{day_end_time.strftime('%H:%M')}"

  # The instant a business day ends: its end time on the following calendar date (02:01 the next morning by default).
  def business_day_end_at(day)
    Time.use_zone(time_zone) { Time.zone.parse("#{day + 1} #{day_end_time.strftime('%H:%M')}") }
  end

  # The tax registration holds the public numbers a receipt prints and the API token only the tax adapter uses. The
  # token never leaves the server (S1, 6 Nov 2026: it printed on receipts and reached every till): staff and receipts
  # get the public numbers, an allow-list; someone who manages settings sees only that a token is saved.
  PUBLIC_TAX_KEYS = %w[authority ntn strn pos_id].freeze

  def public_tax_registration = (tax_registration || {}).slice(*PUBLIC_TAX_KEYS)

  def masked_tax_registration
    token = (tax_registration || {})["token"].to_s
    public_tax_registration.merge("token_set" => token.present?, "token_hint" => token.length >= 12 ? "ends #{token.last(4)}" : nil)
  end

  # The branch form never receives the token back, so a blank or missing token keeps the saved one; a new token
  # replaces it and token_clear removes it. Only the known keys are taken from the form. Returns :changed or :removed for the audit.
  def apply_tax_registration(incoming)
    incoming = incoming.to_h.stringify_keys
    merged = (tax_registration || {}).merge(incoming.slice(*PUBLIC_TAX_KEYS).transform_values { |v| v.to_s.strip.presence })
    token = incoming["token"].to_s.strip
    change = nil
    if ActiveModel::Type::Boolean.new.cast(incoming["token_clear"])
      change = :removed if merged.delete("token")
    elsif token.present? && token != merged["token"]
      merged["token"] = token
      change = :changed
    end
    self.tax_registration = merged.compact
    change
  end

  QR_DEFAULTS = { "enabled" => false, "cashier_accept" => true, "call_waiter" => true, "ask_bill" => true, "running_bill" => true, "guest_name" => true, "welcome" => nil }.freeze

  def qr_setting(key) = (qr_settings || {}).fetch(key.to_s, QR_DEFAULTS[key.to_s])
  def qr_config = QR_DEFAULTS.merge(qr_settings || {})
end
