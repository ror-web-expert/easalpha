class Customer < ApplicationRecord
  include Tenanted
  SOURCES = %w[in_store online qr phone import].freeze
  STATUSES = %w[active pending_approval deactivated].freeze
  belongs_to :group, class_name: "CustomerGroup", optional: true
  has_many :addresses, class_name: "CustomerAddress", dependent: :destroy
  has_many :orders

  validates :name, presence: true
  validates :source, inclusion: { in: SOURCES }
  validates :status, inclusion: { in: STATUSES }
  validates :phone, format: { with: /\A\+[1-9]\d{7,14}\z/ }, allow_nil: true
  validates :phone, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }, allow_nil: true
  before_validation :normalize
  before_create { self.khata_no ||= (Customer.unscoped.where(business_id: business_id).maximum(:khata_no) || 0) + 1 }
  scope :active, -> { where(archived_at: nil) }

  def self.walk_in
    find_by(is_walk_in: true) || create!(name: "Walk-in customer", is_walk_in: true, source: "in_store")
  end

  def self.lookup(q)
    q = q.to_s.strip
    return none if q.blank?
    phone = User.normalize_phone(q)
    scope = active
    if q.match?(/\A#?\d{1,6}\z/) && q.length <= 7 && !q.start_with?("0")
      scope.where(khata_no: q.delete("#").to_i)
    elsif phone && phone.match?(/\A\+\d{8,}\z/)
      scope.where("phone = ? OR phone LIKE ?", phone, "%#{q.gsub(/\D/, '')[-7..] || q}")
    else
      scope.where("name ILIKE :q OR company ILIKE :q OR email ILIKE :q OR phone LIKE :d", q: "%#{q}%", d: "%#{q.gsub(/\D/, '')}%")
    end
  end

  def over_limit?(extra_minor = 0) = credit_limit_minor.present? && (balance_minor + extra_minor) > credit_limit_minor

  private

  def normalize
    self.phone = User.normalize_phone(phone)
    self.email = email.to_s.strip.downcase.presence
    self.name = name.to_s.strip
  end
end
