module Receipts
  # The receipt's header, footer, language and paper: the pos.receipt.* settings the Branding page saves (a branch
  # row over the business row), else the receipt hash businesses kept in businesses.settings before the settings
  # store, else the registry default. The receipt read only that old hash, so a saved header never printed and 58 mm
  # paper came back as 80 (S6, 6 Nov 2026). String keys, as the old hash had them.
  module Branding
    module_function

    FIELDS = %w[header footer language paper].freeze

    def for(business, branch: nil)
      keys = FIELDS.map { |f| "pos.receipt.#{f}" }
      rows = Setting.unscoped.where(business_id: business.id, branch_id: [ nil, branch&.id ].uniq, key: keys).to_a
      stored = rows.sort_by { |r| r.branch_id ? 1 : 0 }.to_h { |r| [ r.key, r.value ] } # the branch row wins
      legacy = business.settings["receipt"].is_a?(Hash) ? business.settings["receipt"] : {}
      FIELDS.to_h do |f|
        key = "pos.receipt.#{f}"
        value = stored.fetch(key) { business.settings.fetch(key) { legacy.fetch(f) { Settings::Registry.key(key).default } } }
        [ f, f == "paper" ? value.to_s.presence : value.presence ]
      end
    end
  end
end
