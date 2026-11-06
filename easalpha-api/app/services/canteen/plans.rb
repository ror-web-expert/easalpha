module Canteen
  module Plans
    module_function

    # The plans of one day (or several), in kiosk order, with what the serializer prices the dishes from.
    def for_day(branch, date)
      MealPlan.includes(:branch, :meal_session, items: { product: %i[product_prices tax_rate] }).where(branch_id: branch.id, plan_date: date)
              .sort_by { |p| [ p.plan_date, p.meal_session.sort_order, p.meal_session.starts_at ] }
    end

    # What one of this dish comes to on a kiosk order (Claims makes a walk-in order of one): the menu price less the
    # product's own discount, its tax, the walk-in service charge and the rounding, priced by Orders::Pricing on an
    # order that is never saved. A plan with no worker price charges the worker this, so the kiosk shows it (F13).
    def dish_price_minor(product, branch)
      order = Order.new(business: branch.business, branch: branch, order_type: "walk_in", source: "kiosk")
      Orders::Builder.apply_charge_defaults!(order, {}, branch.business)
      tax = product.tax_rate || TaxRate.active.find_by(is_default: true)
      order.items.build(business: branch.business, product: product, name_snapshot: product.name, quantity: 1, unit_price_minor: product.price_for(order_type: "walk_in", branch_id: branch.id),
                        tax_rate_snapshot: tax&.rate || 0, tax_inclusive_snapshot: tax&.inclusive || false)
      Orders::Pricing.recalculate!(order).total_minor
    end

    # Saves a session's plan for a day: the items sent replace the current ones; a dish that already has claims stays.
    def save!(branch:, session:, date:, items:, notes: nil, actor: nil)
      plan = MealPlan.find_or_initialize_by(branch_id: branch.id, meal_session_id: session.id, plan_date: date)
      MealPlan.transaction do
        plan.notes = notes unless notes.nil?
        plan.created_by_membership_id ||= actor&.id
        plan.save!
        keep = []
        Array(items).each_with_index do |raw, i|
          h = (raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h).with_indifferent_access
          product = Product.active.find(h[:product_id])
          item = plan.items.find_by(product_id: product.id) || plan.items.build(product: product)
          item.assign_attributes(planned_qty: h[:planned_qty].presence&.to_i, worker_price_minor: h[:worker_price_minor].present? ? h[:worker_price_minor].to_i : nil, sort_order: i)
          item.save!
          keep << item.id
        end
        plan.items.where.not(id: keep).each do |item|
          raise Api::Errors::Conflict.new("canteen.item_claimed", "#{item.product.name} already has meals claimed and cannot be removed") if item.claims_count.positive?
          item.destroy!
        end
      end
      plan.reload
    end

    def publish!(plan)
      raise Api::Errors::Conflict.new("canteen.plan_empty", "Add at least one dish before publishing") if plan.items.empty?
      plan.update!(status: "published", published_at: plan.published_at || Time.current)
      plan
    end

    def unpublish!(plan)
      raise Api::Errors::Conflict.new("canteen.plan_in_use", "Meals were already claimed from this plan") if plan.claims.live.exists?
      plan.update!(status: "draft")
      plan
    end

    # How far back the roll looks for a session's last published plan: past a weekly day off or a missed run.
    ROLL_LOOKBACK = 7

    # The daily roll (CanteenPlansRollJob): for every active session with no plan at all on `date`, copies the
    # session's latest published plan of the week before and publishes it, so the kiosk is never empty because nobody
    # copied the menu (a day off in between no longer leaves the next day empty). A draft already started for the day
    # is left alone (someone is planning it); a dish archived since is dropped. Returns how many plans were published.
    def roll_forward!(branch:, date:)
      rolled = 0
      MealSession.active.where(branch_id: branch.id).find_each do |session|
        next if MealPlan.exists?(branch_id: branch.id, meal_session_id: session.id, plan_date: date)
        src = MealPlan.includes(:items).where(branch_id: branch.id, meal_session_id: session.id, plan_date: (date - ROLL_LOOKBACK)...date, status: "published").order(plan_date: :desc).first or next
        items = src.items.select { |i| Product.active.exists?(id: i.product_id) }.map { |i| { product_id: i.product_id, planned_qty: i.planned_qty, worker_price_minor: i.worker_price_minor } }
        next if items.empty?
        publish!(save!(branch: branch, session: session, date: date, notes: src.notes, items: items, actor: nil))
        rolled += 1
      end
      rolled
    end

    # Copies every session's plan from one day onto another (as drafts), skipping sessions the target day already has.
    def copy!(branch:, from:, to:, actor: nil)
      copied = 0
      for_day(branch, from).each do |src|
        next if MealPlan.exists?(branch_id: branch.id, meal_session_id: src.meal_session_id, plan_date: to)
        save!(branch: branch, session: src.meal_session, date: to, notes: src.notes, actor: actor,
              items: src.items.map { |i| { product_id: i.product_id, planned_qty: i.planned_qty, worker_price_minor: i.worker_price_minor } })
        copied += 1
      end
      copied
    end
  end
end
