class Category < ApplicationRecord
  include Tenanted
  belongs_to :menu
  has_many :products, -> { where(archived_at: nil).order(:sort_order, :name) }, dependent: :destroy
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }
  before_create { self.sort_order = (Category.where(menu_id: menu_id).maximum(:sort_order) || -1) + 1 if sort_order.zero? }
end
