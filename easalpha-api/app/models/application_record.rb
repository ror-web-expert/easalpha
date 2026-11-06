class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  # "%text%" for an ILIKE that finds text anywhere, with the user's own % and _ (and \) taken literally: unescaped,
  # a search for "50%" or "a_b" matched far more than it said (review of 6 Nov 2026, R14).
  def self.contains_pattern(text) = "%#{sanitize_sql_like(text.to_s)}%"
end
