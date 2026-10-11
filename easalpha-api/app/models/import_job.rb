class ImportJob < ApplicationRecord
  include Tenanted
  KINDS = %w[menu stock_items customers suppliers employees].freeze
  SOURCES = %w[csv xlsx arfapos_json].freeze
  validates :kind, inclusion: { in: KINDS }
  validates :source, inclusion: { in: SOURCES }
end
