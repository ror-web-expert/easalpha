class ChecklistTemplate < ApplicationRecord
  include Tenanted
  DEFAULTS = {
    "opening" => ["Count the opening float", "Switch on the kitchen equipment", "Check the fridge temperatures", "Wipe the counters and tables", "Check the receipt printer paper", "Confirm today's menu and specials"],
    "closing" => ["Close the shift and count the drawer", "Record waste", "Switch off the gas and equipment", "Clean the kitchen and floor", "Lock the stock room", "Set the alarm and lock up"]
  }.freeze
  belongs_to :branch, optional: true
  validates :kind, inclusion: { in: %w[opening closing] }

  def self.for(kind, branch_id:)
    where(kind: kind, branch_id: branch_id).first || where(kind: kind, branch_id: nil).first ||
      create!(kind: kind, branch_id: nil, items: DEFAULTS[kind].each_with_index.map { |label, i| { "key" => "item_#{i + 1}", "label" => label } })
  end
end
