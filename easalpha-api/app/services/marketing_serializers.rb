module MarketingSerializers
  module_function

  def tier(t)
    { id: t.id, name: t.name, within_days: t.within_days, kind: t.kind, value: t.value.to_f, min_order_minor: t.min_order_minor, excluded_product_ids: t.excluded_product_ids, excluded_category_ids: t.excluded_category_ids,
      excluded_order_types: t.excluded_order_types, active: t.active, archived_at: t.archived_at }
  end

  def batch(b)
    { id: b.id, name: b.name, kind: b.kind, value_kind: b.value_kind, value: b.value.to_f, min_spend_minor: b.min_spend_minor, expires_on: b.expires_on, usage_limit: b.usage_limit, public_code: b.public_code,
      issued_count: b.issued_count, redeemed_count: b.redeemed_count, active: b.active, expired: b.expired?, exhausted: b.exhausted?, created_at: b.created_at }
  end

  def voucher(v)
    { id: v.id, voucher_batch_id: v.voucher_batch_id, batch_name: v.voucher_batch.name, code: v.code, customer_id: v.customer_id, customer_name: v.customer&.name, status: v.status, redeemed_order_id: v.redeemed_order_id,
      redeemed_at: v.redeemed_at, sent_at: v.sent_at, created_at: v.created_at }
  end

  def review(r)
    { id: r.id, order_id: r.order_id, order_label: r.order&.label, customer_id: r.customer_id, customer_name: r.customer&.name, rating: r.rating, rating_word: r.rating_word, comment: r.comment, source: r.source,
      order_type: r.order_type, order_total_minor: r.order_total_minor, pending: r.rating.nil?, rated_at: r.rated_at, created_at: r.created_at }
  end

  def redemption_option(o)
    { id: o.id, name: o.name, points: o.points, kind: o.kind, value: o.value.to_f, product_id: o.product_id, product_name: o.product&.name, active: o.active, sort_order: o.sort_order }
  end

  def insight(i)
    { id: i.id, kind: i.kind, from_date: i.from_date, to_date: i.to_date, engine: i.engine, generated_at: i.generated_at, payload: i.payload }
  end

  def website_config(w)
    { id: w.id, slug: w.slug, published: w.published, sections: w.sections, section_names: WebsiteConfig::SECTIONS, updated_at: w.updated_at }
  end
end
