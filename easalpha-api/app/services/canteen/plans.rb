module Canteen
  module Plans
    module_function

    def for_day(branch, date)
      MealPlan.includes(:meal_session, items: :product).where(branch_id: branch.id, plan_date: date).sort_by { |p| [ p.meal_session.sort_order, p.meal_session.starts_at ] }
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
