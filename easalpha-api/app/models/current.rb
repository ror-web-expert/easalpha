class Current < ActiveSupport::CurrentAttributes
  # support_session: set while EasAlpha support works in the business on an approved session; the audit log names them.
  attribute :business, :branch, :user, :membership, :device, :app, :request_id, :ip, :allow_unscoped, :audited, :support_session

  def business_id = business&.id
  def branch_id = branch&.id
  def user_id = user&.id
end
