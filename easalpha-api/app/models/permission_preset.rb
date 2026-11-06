# The three SPEC presets for the permission editor: Cashier, Supervisor, Manager. Applying one fills a user's grants;
# it is a shortcut, not a role. The seven role templates in RoleTemplate stay as EasAlpha extras.
#
# A preset replaces the whole set, so it gives the same access as the role it is named after: its SPEC codes plus that
# role's EasAlpha codes (the app it opens, the reports it reads, staff and stock). Built from SPEC codes alone, the
# Manager preset took a manager's admin access, staff and all-reports away while the editor said "Access saved", and the
# next login answered "You don't have access to this app" (QA of 6 Nov 2026, S4).
module PermissionPreset
  CASHIER_SPEC = %w[
    DASHBOARD VIEW_DAILY_SALES OFFLINE_ORDERS PRINTERS
    SALES_WALKIN SALES_TAKEAWAY SALES_DELIVERY
    ORDERS COMPLETE_ORDER PLACE_AND_COMPLETE_ORDER
    PAYMENT ACCEPT_PAYMENT APPLY_VOUCHER
    CUSTOMER_ACCOUNT
    RIDERS RIDER_VIEW
    KDS EXPENSES MY_TILL
  ].freeze

  SUPERVISOR_SPEC = (CASHIER_SPEC + %w[
    VIEW_SALES_ANALYTICS SETTINGS
    WEB_ORDERS CANCEL_ORDER REOPEN_ORDER COMPLIMENTARY_ORDER
    DELETE_ORDER_ITEM MODIFY_REOPEN_DECREASE_QTY
    SEND_ACCOUNT_BILL
    PURCHASE_ORDERS PO_CREATE PO_RECEIVE PO_ADD_ITEM PO_ADD_SUPPLIER
    SUPPLIERS SUPPLIER_VIEW_LEDGER
    MARKETING MARKETING_CAMPAIGN MARKETING_CAMPAIGN_LOG MARKETING_CONTACTS MARKETING_AUTO_SEND_LOG
    RIDER_CREATE RIDER_EDIT DUMMY_RIDER_VIEW DUMMY_RIDER_CREATE DUMMY_RIDER_EDIT DUMMY_RIDER_DELETE
    REPORTS
  ]).freeze

  def self.easalpha_codes_of(role_key) = RoleTemplate::TEMPLATES.fetch(role_key)[:permissions].reject { |c| Permission.entry(c).spec? }

  CASHIER = (CASHIER_SPEC + easalpha_codes_of("cashier")).uniq.freeze
  # A senior cashier: the Cashier's till access plus what its extra SPEC codes imply.
  SUPERVISOR = (SUPERVISOR_SPEC + easalpha_codes_of("cashier")).uniq.freeze
  # The Manager role exactly: every SPEC code but PAYROLL and every EasAlpha code but payroll, settings and billing
  # (docs/01-features.md section 10, as RoleTemplate builds it).
  MANAGER = RoleTemplate::TEMPLATES.fetch("manager")[:permissions].dup.freeze

  ALL = { "cashier" => { name: "Cashier", codes: CASHIER }, "supervisor" => { name: "Supervisor", codes: SUPERVISOR }, "manager" => { name: "Manager", codes: MANAGER } }.freeze

  def self.codes_for(key) = ALL.fetch(key.to_s) { raise ArgumentError, "unknown preset: #{key}" }[:codes]
  def self.list = ALL.map { |key, p| { key: key, name: p[:name], codes: p[:codes] } }
end
