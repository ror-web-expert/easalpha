class Delivery < ApplicationRecord
  include Tenanted
  STATUSES = %w[unassigned assigned picked_up on_the_way arrived delivered failed].freeze
  FLOW = { "unassigned" => %w[assigned], "assigned" => %w[picked_up on_the_way failed unassigned], "picked_up" => %w[on_the_way arrived delivered failed], "on_the_way" => %w[arrived delivered failed],
           "arrived" => %w[delivered failed], "delivered" => [], "failed" => %w[assigned unassigned] }.freeze
  belongs_to :branch
  belongs_to :order
  belongs_to :rider, optional: true
  belongs_to :zone, class_name: "DeliveryZone", optional: true
  has_many :events, -> { order(:occurred_at) }, class_name: "DeliveryStatusEvent", dependent: :destroy
  validates :status, inclusion: { in: STATUSES }

  def can_move_to?(to) = FLOW.fetch(status, []).include?(to)
  def settled? = settled_at.present?
end
