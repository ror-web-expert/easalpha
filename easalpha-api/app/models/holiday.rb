class Holiday < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  validates :name, :on_date, presence: true
end
