module Campaigns
  module Sender
    module_function

    # Sends the campaign body to every reachable customer. {name} and {code} are filled per customer.
    def send!(campaign)
      raise Api::Errors::Conflict.new("campaign.status", "Campaign is #{campaign.status}") unless campaign.status.in?(%w[draft scheduled sending])
      campaign.update!(status: "sending", started_at: campaign.started_at || Time.current)
      sent = skipped = 0
      Segments.customers(campaign.segment).find_each do |c|
        unless c.whatsapp_opt_in && c.opted_out_at.nil?
          skipped += 1
          next
        end
        text = campaign.body.gsub("{name}", c.name).gsub("{code}", campaign.promotion&.coupon_code.to_s).gsub("{balance}", "Rs #{c.balance_minor / 100}")
        msg = Whatsapp::Sender.deliver(phone: c.phone, template: "campaign", kind: "marketing", customer_id: c.id, variables: { text: text, campaign: campaign.name })
        msg&.update_column(:campaign_id, campaign.id)
        sent += 1
      end
      campaign.update!(status: "sent", finished_at: Time.current, sent_count: sent, skipped_count: skipped, audience_count: sent + skipped)
      campaign
    end

    def stats(campaign)
      msgs = WhatsappMessage.where(campaign_id: campaign.id)
      redeemed = campaign.promotion ? DiscountApplied.where(promotion_id: campaign.promotion_id).count : 0
      { audience: campaign.audience_count, sent: campaign.sent_count, skipped: campaign.skipped_count, delivered: msgs.where(status: %w[delivered read]).count, read: msgs.where(status: "read").count,
        failed: msgs.where(status: "failed").count, redeemed: redeemed, opted_out_after: Customer.where(id: msgs.select(:customer_id)).where("opted_out_at > ?", campaign.started_at || Time.current).count }
    end
  end
end
