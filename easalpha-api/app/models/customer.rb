class Customer < ApplicationRecord
  include Tenanted
  SOURCES = %w[in_store online qr phone import].freeze
  STATUSES = %w[active pending_approval deactivated].freeze
  belongs_to :group, class_name: "CustomerGroup", optional: true
  has_many :addresses, class_name: "CustomerAddress", dependent: :destroy
  has_many :orders
  has_many :adjustments, class_name: "CustomerAdjustment", dependent: :restrict_with_error

  validates :name, presence: true
  validates :source, inclusion: { in: SOURCES }
  validates :status, inclusion: { in: STATUSES }
  validates :phone, format: { with: /\A\+[1-9]\d{7,14}\z/ }, allow_nil: true
  validates :phone, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }, allow_nil: true
  validates :guardian_phone, format: { with: /\A\+[1-9]\d{7,14}\z/ }, allow_nil: true
  before_validation :normalize
  before_create { self.khata_no ||= (Customer.unscoped.where(business_id: business_id).maximum(:khata_no) || 0) + 1 }
  scope :active, -> { where(archived_at: nil) }

  def self.walk_in
    find_by(is_walk_in: true) || create!(name: "Walk-in customer", is_walk_in: true, source: "in_store")
  end

  # Search by a name or a number (Customers::Search): the admin lists and the till use the same rules.
  def self.lookup(q) = Customers::Search.scope(q)

  def over_limit?(extra_minor = 0) = credit_limit_minor.present? && (balance_minor + extra_minor) > credit_limit_minor

  # Phones that receive account messages and bills: the customer's own, and the guardian's when asked for (or when the
  # customer has no phone of their own).
  def account_phones
    list = [ phone ]
    list << guardian_phone if guardian_phone.present? && (notify_guardian || phone.blank?)
    list.compact_blank.uniq
  end

  private

  def normalize
    self.phone = User.normalize_phone(phone)
    self.guardian_phone = guardian_phone.present? ? User.normalize_phone(guardian_phone) : nil
    self.member_no = member_no.to_s.strip.presence
    self.room = room.to_s.strip.presence
    self.guardian_name = guardian_name.to_s.strip.presence
    self.email = email.to_s.strip.downcase.presence
    self.name = name.to_s.strip
  end
end
