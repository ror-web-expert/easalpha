class WhatsappTemplate < ApplicationRecord
  # business_id nil = shared EasAlpha template. Not Tenanted so shared rows are visible to everyone.
  CATEGORIES = %w[authentication utility marketing].freeze
  validates :name, :body, presence: true
  validates :category, inclusion: { in: CATEGORIES }

  DEFAULTS = [
    [ "login_otp", "en", "authentication", "Your EasAlpha code is {{code}}. It expires in 10 minutes.", %w[code] ],
    [ "login_otp", "ur", "authentication", "آپ کا EasAlpha کوڈ {{code}} ہے۔ یہ 10 منٹ میں ختم ہو جائے گا۔", %w[code] ],
    [ "staff_invite", "en", "utility", "{{business}} added you on EasAlpha as {{role}}. Open the app to start.", %w[business role] ],
    [ "digital_receipt", "en", "utility", "Thank you for your order {{order_label}} at {{business_name}}. Total Rs {{total}}. Receipt: {{link}}", %w[business_name order_label total receipt_number link] ],
    [ "digital_receipt", "ur", "utility", "{{business_name}} پر آپ کے آرڈر {{order_label}} کا شکریہ۔ کل Rs {{total}}۔ رسید: {{link}}", %w[business_name order_label total receipt_number link] ],
    [ "order_status", "en", "utility", "{{business_name}}: your order {{order_label}} is {{status}}.", %w[business_name order_label status] ],
    [ "birthday_offer", "en", "marketing", "Happy birthday {{name}}! Enjoy {{percent}}% off with code {{code}} in the next {{days}} days.", %w[name code percent days] ],
    [ "campaign", "en", "marketing", "{{text}}", %w[text campaign] ],
    [ "reservation_confirmed", "en", "utility", "{{name}}, your table for {{party}} is booked for {{when}}{{table}}. Reply to change it.", %w[name when party table] ],
    [ "reservation_reminder", "en", "utility", "{{name}}, a reminder: your table for {{party}} is at {{when}} today. See you soon!", %w[name when party] ],
    [ "scheduled_report", "en", "utility", "{{name}}\n{{text}}", %w[name text] ],
    [ "khata_payment_received", "en", "utility", "{{business_name}} received Rs {{amount}} from {{customer_name}}. New balance: Rs {{new_balance}}.", %w[customer_name amount new_balance business_name] ],
    [ "khata_payment_received", "ur", "utility", "{{business_name}} نے {{customer_name}} سے Rs {{amount}} وصول کیے۔ نیا بیلنس: Rs {{new_balance}}۔", %w[customer_name amount new_balance business_name] ],
    [ "daily_summary", "en", "utility", "{{business_name}} {{branch}} {{day}}: {{summary}}", %w[business_name branch day summary] ],
    [ "alert_cash_short", "en", "utility", "Cash short Rs {{amount}} on {{day}}. Open EasAlpha to review the shift.", %w[amount day] ],
    [ "alert_big_void", "en", "utility", "A void of Rs {{amount}} ({{reason}}) was approved by {{approver}} on order {{order_label}}.", %w[amount reason approver order_label] ],
    [ "trial_reminder", "en", "utility", "{{business_name}}: your EasAlpha trial ends in {{days}} days on {{ends_on}}. Pay yearly before then and get an extra month free.", %w[business_name days ends_on] ],
    [ "trial_reminder", "ur", "utility", "{{business_name}}: آپ کا EasAlpha ٹرائل {{days}} دن میں {{ends_on}} کو ختم ہو رہا ہے۔", %w[business_name days ends_on] ],
    [ "invoice_due", "en", "utility", "{{business_name}}: invoice {{number}} of Rs {{amount}} is due on {{due_on}}. Pay by JazzCash, EasyPaisa or bank transfer and reply with the reference.", %w[business_name number amount due_on] ],
    [ "account_read_only", "en", "utility", "{{business_name}}: your EasAlpha account is now read-only. Renew to keep taking orders. Your data is safe for 60 days.", %w[business_name] ]
  ].freeze

  def self.seed_defaults!
    DEFAULTS.each do |name, lang, cat, body, vars|
      find_or_initialize_by(business_id: nil, name: name, language: lang).update!(category: cat, body: body, variables: vars, approval_status: "approved")
    end
    Whatsapp::Account.seed_account_templates! # SPEC account statements and receipts
  end
end
