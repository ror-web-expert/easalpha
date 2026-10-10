class Current < ActiveSupport::CurrentAttributes
  attribute :business, :branch, :user, :membership, :device, :app, :request_id, :ip, :allow_unscoped

  def business_id = business&.id
  def branch_id = branch&.id
  def user_id = user&.id
end
