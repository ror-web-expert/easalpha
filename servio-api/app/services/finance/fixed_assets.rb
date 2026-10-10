module Finance
  # SPEC Fixed Assets: register an asset (posting its acquisition), depreciate it straight-line month by month through
  # journal entries, and dispose of it.
  module FixedAssets
    module_function

    # paid_from: a payment account id, "payable" (owed to a supplier) or "capital" (contributed by the owner)
    def create!(attrs, actor:, branch:, paid_from: nil)
      asset_account = GlAccount.active.find(attrs[:gl_account_id])
      raise Api::Errors::BadRequest.new("fixed_asset.account", "Choose an account under Fixed Assets") unless asset_account.kind == "asset" && asset_account.code.start_with?("15") && asset_account.code != "1590"
      FixedAsset.transaction do
        asset = FixedAsset.create!(name: attrs[:name], gl_account: asset_account, accumulated_account: Chart.account("1590"), expense_account: Chart.account("5900"), cost_minor: attrs[:cost_minor].to_i,
                                   salvage_minor: attrs[:salvage_minor].to_i, purchased_on: attrs[:purchased_on].presence || branch.business_day_for(Time.current), useful_life_months: attrs[:useful_life_months].to_i,
                                   note: attrs[:note], branch_id: branch.id)
        credit = case paid_from.to_s
        when "", "capital" then Chart.account("3010")
        when "payable" then Chart.account("2010")
        else Chart.for_payment_account(PaymentAccount.active.find(paid_from))
        end
        Journal.post!(business_day: asset.purchased_on, description: "Asset #{asset.name}", ref: asset, actor: actor, branch_id: branch.id,
                      lines: [ { account: asset_account, debit_minor: asset.cost_minor }, { account: credit, credit_minor: asset.cost_minor } ])
        if credit.payment_account
          credit.payment_account.post!(kind: "withdrawal", amount_minor: -asset.cost_minor, business_day: asset.purchased_on, ref: asset, description: "Asset #{asset.name}", by: actor, branch_id: branch.id, skip_journal: true)
        end
        asset
      end
    end

    # Posts depreciation for every full month up to the given date.
    def depreciate!(asset, through: nil, actor: nil)
      through ||= Journal.today
      raise Api::Errors::Conflict.new("fixed_asset.disposed", "#{asset.name} is disposed") unless asset.status == "active"
      from = asset.depreciated_through || asset.purchased_on
      months = (through.year * 12 + through.month) - (from.year * 12 + from.month)
      months -= 1 if asset.depreciated_through.nil? && through.day < asset.purchased_on.day
      return asset if months <= 0
      amount = [ asset.monthly_minor * months, asset.depreciable_minor - asset.accumulated_minor ].min
      return asset if amount <= 0
      FixedAsset.transaction do
        Journal.post!(business_day: through, description: "Depreciation #{asset.name} (#{months} months)", ref: asset, actor: actor, branch_id: asset.branch_id,
                      lines: [ { account: asset.expense_account, debit_minor: amount }, { account: asset.accumulated_account, credit_minor: amount } ])
        asset.update!(accumulated_minor: asset.accumulated_minor + amount, depreciated_through: through)
      end
      asset
    end

    def dispose!(asset, actor:, on: nil, proceeds_minor: 0, proceeds_account_id: nil)
      on ||= Journal.today
      raise Api::Errors::Conflict.new("fixed_asset.disposed", "#{asset.name} is already disposed") unless asset.status == "active"
      FixedAsset.transaction do
        lines = [ { account: asset.accumulated_account, debit_minor: asset.accumulated_minor }, { account: asset.gl_account, credit_minor: asset.cost_minor } ]
        book = asset.book_value_minor
        if proceeds_minor.to_i.positive? && proceeds_account_id
          pa = PaymentAccount.active.find(proceeds_account_id)
          lines << { account: Chart.for_payment_account(pa), debit_minor: proceeds_minor.to_i }
          pa.post!(kind: "deposit", amount_minor: proceeds_minor.to_i, business_day: on, ref: asset, description: "Sold #{asset.name}", by: actor, branch_id: asset.branch_id, skip_journal: true)
        end
        gain = proceeds_minor.to_i - book
        lines << (gain.negative? ? { account: "5190", debit_minor: -gain } : { account: "4100", credit_minor: gain }) unless gain.zero?
        Journal.post!(business_day: on, description: "Disposal #{asset.name}", ref: asset, actor: actor, branch_id: asset.branch_id, lines: lines)
        asset.update!(status: "disposed", disposed_at: Time.current)
      end
      asset
    end
  end
end
