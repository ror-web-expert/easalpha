# SPEC Reviews: from the tablet and the website, tied to an order and its amount, 1 to 5 shown as a word, optional
# comment; a review without a rating is Pending (Unrated).
class Review < ApplicationRecord
  include Tenanted
  WORDS = { 1 => "Poor", 2 => "Fair", 3 => "Good", 4 => "Very good", 5 => "Excellent" }.freeze
  belongs_to :order, optional: true
  belongs_to :customer, optional: true
  validates :rating, inclusion: { in: 1..5 }, allow_nil: true
  validates :source, inclusion: { in: %w[tablet website pos qr] }
  scope :rated, -> { where.not(rating: nil) }
  scope :pending, -> { where(rating: nil) }
  def rating_word = rating && WORDS[rating]
end
