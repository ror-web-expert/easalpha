# The three SPEC presets for the permission editor: Cashier, Supervisor, Manager. Applying one fills a user's grants;
# it is a shortcut, not a role. The seven role templates in RoleTemplate stay as EasAlpha extras.
module PermissionPreset
  CASHIER = %w[
    DASHBOARD VIEW_DAILY_SALES OFFLINE_ORDERS PRINTERS
    SALES_WALKIN SALES_TAKEAWAY SALES_DELIVERY
    ORDERS COMPLETE_ORDER PLACE_AND_COMPLETE_ORDER
    PAYMENT ACCEPT_PAYMENT APPLY_VOUCHER
    CUSTOMER_ACCOUNT
    RIDERS RIDER_VIEW
    KDS EXPENSES MY_TILL
  ].freeze

  SUPERVISOR = (CASHIER + %w[
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

  MANAGER = (Permission.spec_codes - Permission.restriction_codes).freeze

  ALL = { "cashier" => { name: "Cashier", codes: CASHIER }, "supervisor" => { name: "Supervisor", codes: SUPERVISOR }, "manager" => { name: "Manager", codes: MANAGER } }.freeze

  def self.codes_for(key) = ALL.fetch(key.to_s) { raise ArgumentError, "unknown preset: #{key}" }[:codes]
  def self.list = ALL.map { |key, p| { key: key, name: p[:name], codes: p[:codes] } }
end
