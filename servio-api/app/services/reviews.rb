# SPEC Reviews: total reviews, average rating, 5-star and 1-star counts; filters by rating, source, type and Pending.
module Reviews
  module_function

  def create!(attrs, order: nil)
    Review.create!(order: order, customer_id: attrs[:customer_id].presence || order&.customer_id, rating: attrs[:rating].presence&.to_i, comment: attrs[:comment], source: attrs[:source].presence || "tablet",
                   order_type: order&.order_type || attrs[:order_type], order_total_minor: order&.total_minor || attrs[:order_total_minor].to_i, branch_id: order&.branch_id || Current.branch_id,
                   rated_at: attrs[:rating].present? ? Time.current : nil)
  end

  def rate!(review, rating:, comment: nil)
    review.update!(rating: rating.to_i, comment: comment.presence || review.comment, rated_at: Time.current)
    review
  end

  def summary(scope)
    rated = scope.rated
    count = rated.count
    { total: scope.count, rated: count, pending: scope.pending.count, average: count.zero? ? nil : (rated.sum(:rating).to_f / count).round(2),
      five_star: rated.where(rating: 5).count, one_star: rated.where(rating: 1).count, by_rating: (1..5).to_h { |r| [r, rated.where(rating: r).count] } }
  end
end
