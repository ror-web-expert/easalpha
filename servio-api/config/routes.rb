Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get "health", to: "health#show"

      post "auth/signup", to: "auth#signup"
      post "auth/login", to: "auth#login"
      post "auth/otp/request", to: "auth#otp_request"
      post "auth/otp/verify", to: "auth#otp_verify"
      post "auth/refresh", to: "auth#refresh"
      post "auth/logout", to: "auth#logout"
      post "auth/switch", to: "auth#switch"

      get "me", to: "me#show"
      patch "me", to: "me#update"
      get "business", to: "business#show"
      patch "business", to: "business#update"
      resources :branches, only: %i[index show create update destroy]
      resources :staff, only: %i[index show create update] do
        member do
          post :set_pin
          post :deactivate
          post :reactivate
        end
      end
      resources :roles, only: %i[index show create update destroy] do
        collection { get :permissions }
      end
      resources :devices, only: %i[index create update destroy] do
        member { post :regenerate_code }
        collection do
          post :pair
          post :pin_login
          post :heartbeat
        end
      end
      resources :audit_logs, only: :index
      get "setup_checklist", to: "setup_checklist#index"
      post "setup_checklist/:key/complete", to: "setup_checklist#complete"
      resources :notifications, only: :index do
        member { post :read }
      end

      resources :menus, only: %i[index show create update destroy] do
        collection { post :reorder }
      end
      resources :categories, only: %i[index create update destroy] do
        collection { post :reorder }
      end
      resources :products, only: %i[index show create update destroy] do
        collection { post :reorder }
        member { post :favourite }
      end
      resources :modifier_groups, only: %i[index show create update destroy]
      resources :deals, only: %i[index show create update destroy]
      resources :promotions, only: %i[index show create update destroy] do
        collection { get :check }
      end
      resources :tax_rates, only: %i[index create update destroy]
      resources :stations, only: %i[index create update destroy]
      get "menu/export", to: "menu_transfer#export"
      post "menu/import/preview", to: "menu_transfer#import_preview"
      post "menu/import/apply", to: "menu_transfer#import_apply"
      get "catalog", to: "catalog#show"

      resources :orders, only: %i[index show create update] do
        collection { get :summary }
        member do
          post :place
          post :hold
          post :resume
          post :serve
          post :close
          post :void
          post :discounts, action: :add_discount
          delete "discounts/:discount_id", action: :remove_discount
          post :payments, to: "payments#create"
          post :refunds, to: "payments#refund"
          get :receipt, to: "receipts#show"
          post "receipt/reprint", to: "receipts#reprint"
          post "receipt/printed", to: "receipts#printed"
          post "receipt/send", to: "receipts#send_receipt"
        end
      end
      get "payments", to: "payments#index"
      resources :shifts, only: %i[index show create] do
        collection { get :current }
        member do
          post :close
          post :approve
          post :settle
          post :cash_movements, action: :cash_movement
          get :z_report
        end
      end
      get "day_close", to: "day_closes#show"
      get "reports/dashboard", to: "reports#dashboard"
      %w[overview by_day by_hour items categories cashiers order_takers voids discounts modified customers shifts grand].each { |r| get "reports/#{r}", to: "reports##{r}" }
      post "sync/push", to: "sync#push"
      get "sync/changes", to: "sync#changes"
      get "sync/rejections", to: "sync#rejections"
      post "sync/rejections/:id/resolve", to: "sync#resolve"
      get "sync/batches", to: "sync#batches"
      resources :tax_invoices, only: %i[index show] do
        collection { get :summary }
        member { post :retry }
      end
      get "customers/:id/ledger", to: "customer_ledger#show"
      get "webhooks/whatsapp", to: "webhooks#whatsapp_verify"
      post "webhooks/whatsapp", to: "webhooks#whatsapp"
      post "day_close/lock", to: "day_closes#lock"
      post "day_close/reopen", to: "day_closes#reopen"
      resources :payment_methods, only: %i[index create update]
      resources :payment_accounts, only: %i[index show create update] do
        member do
          get :entries
          post :transfer
          post :adjust
        end
      end
      get "customers/aging", to: "customer_ledger#aging"
      get "customers/ledger_summary", to: "customer_ledger#summary"
      resources :customers, only: %i[index show create update destroy] do
        collection do
          get :lookup
          post :import
        end
        member do
          get :orders
          post :approve
          get :payments, to: "customer_payments#index"
          post :payments, to: "customer_payments#create"
          post :addresses, action: :add_address
          delete "addresses/:address_id", action: :remove_address
        end
      end
      resources :customer_groups, only: %i[index create update destroy]
      resources :tables, only: %i[index create update destroy] do
        collection do
          get :floors
          put :layout
          post :floors, action: :create_floor
          patch "floors/:id", action: :update_floor
          delete "floors/:id", action: :destroy_floor
        end
        member do
          post :move
          post :merge
          post :assign_waiter
          post :regenerate_qr
        end
      end
      get "kitchen/orders", to: "kitchen#orders"
      get "kitchen/tickets", to: "kitchen#tickets"
      post "kitchen/tickets/:id/printed", to: "kitchen#ticket_printed"
      post "kitchen/orders/:id/start", to: "kitchen#start"
      post "kitchen/orders/:id/bump", to: "kitchen#bump"
      post "kitchen/items/:id/bump", to: "kitchen#bump_item"
      get "kitchen/ready", to: "kitchen#ready"

      # Payroll and attendance (Phase 3)
      get "employees/departments", to: "employees#departments"
      post "employees/departments", to: "employees#create_department"
      delete "employees/departments/:id", to: "employees#destroy_department"
      get "employees/components", to: "employees#components"
      post "employees/components", to: "employees#create_component"
      delete "employees/components/:id", to: "employees#destroy_component"
      get "employees/rules", to: "employees#rules"
      put "employees/rules", to: "employees#upsert_rule"
      get "employees/leaves", to: "employees#leaves"
      post "employees/leaves", to: "employees#create_leave"
      post "employees/leaves/:id/decide", to: "employees#decide_leave"
      get "employees/holidays", to: "employees#holidays"
      post "employees/holidays", to: "employees#create_holiday"
      delete "employees/holidays/:id", to: "employees#destroy_holiday"
      resources :employees, only: %i[index show create update destroy]
      get "attendance", to: "attendance#index"
      get "attendance/summary", to: "attendance#summary"
      post "attendance/check_in", to: "attendance#check_in"
      post "attendance/check_out", to: "attendance#check_out"
      post "attendance/mark", to: "attendance#mark"
      post "attendance/fill_absences", to: "attendance#fill_absences"
      get "payroll/runs", to: "payroll#runs"
      post "payroll/runs", to: "payroll#generate"
      get "payroll/runs/:id", to: "payroll#show_run"
      post "payroll/runs/:id/pay", to: "payroll#pay"
      post "payroll/runs/:id/cancel", to: "payroll#cancel_run"
      get "payroll/payslips/:id", to: "payroll#payslip"
      get "payroll/advances", to: "payroll#advances"
      post "payroll/advances", to: "payroll#create_advance"
      post "payroll/advances/:id/decide", to: "payroll#decide_advance"
      post "payroll/advances/:id/pay", to: "payroll#pay_advance"

      # Finance, aggregators, multi-branch (Phase 3)
      %w[ledger reconciliation integrity profit_loss export].each { |r| get "finance/#{r}", to: "finance##{r}" }
      get "reports/branches", to: "finance#branches"
      get "reports/foodpanda", to: "finance#foodpanda_report"
      get "integrations/foodpanda", to: "finance#foodpanda"
      patch "integrations/foodpanda", to: "finance#update_foodpanda"
      post "webhooks/foodpanda/:slug", to: "webhooks#foodpanda"

      # Loyalty, campaigns, reservations, commissions, checklists (Phase 2/3)
      get "loyalty/settings", to: "loyalty#settings"
      patch "loyalty/settings", to: "loyalty#update_settings"
      get "customers/:id/loyalty", to: "loyalty#customer"
      post "customers/:id/loyalty/adjust", to: "loyalty#adjust"
      post "orders/:id/redeem_points", to: "loyalty#redeem"
      get "campaigns/audience", to: "campaigns#audience"
      resources :campaigns, only: %i[index show create update destroy] do
        member do
          post :send, action: :send_now
          get :stats
        end
      end
      get "reservations/availability", to: "reservations#availability"
      resources :reservations, only: %i[index show create update] do
        member do
          post :seat
          post :confirm
          post :no_show
          post :cancelled, action: :cancelled
          post :completed, action: :completed
        end
      end
      resources :commission_rules, only: %i[index create update destroy]
      get "reports/commissions", to: "commission_rules#report"
      get "checklists/templates", to: "checklists#templates"
      put "checklists/templates/:kind", to: "checklists#update_template"
      get "checklists/today", to: "checklists#today"
      get "checklists/runs", to: "checklists#runs"
      post "checklists/runs/:id/tick", to: "checklists#tick"
      post "checklists/runs/:id/complete", to: "checklists#complete"

      # QR ordering, queue display and scheduled reports (Phase 2)
      get "qr/:token", to: "qr#show"
      get "qr/:token/bill", to: "qr#bill"
      post "qr/:token/orders", to: "qr#create_order"
      get "qr/:token/orders/:id", to: "qr#order"
      post "qr/:token/requests", to: "qr#create_request"
      get "qr_orders", to: "qr_orders#index"
      post "qr_orders/:id/accept", to: "qr_orders#accept"
      post "qr_orders/:id/reject", to: "qr_orders#reject"
      get "qr_orders/requests", to: "qr_orders#requests"
      post "qr_orders/requests/:id/handle", to: "qr_orders#handle_request"
      get "kitchen/queue", to: "kitchen#queue"
      get "tables/:id/qr", to: "tables#qr_card"
      resources :report_schedules, only: %i[index create update destroy] do
        member do
          get :preview
          post :run
        end
      end

      # Expenses, overheads, delivery and riders (Phase 2)
      get "expenses/categories", to: "expenses#categories"
      post "expenses/categories", to: "expenses#create_category"
      patch "expenses/categories/:id", to: "expenses#update_category"
      delete "expenses/categories/:id", to: "expenses#destroy_category"
      get "expenses/summary", to: "expenses#summary"
      resources :expenses, only: %i[index show create update] do
        member { post :void }
      end
      resources :overheads, only: %i[index create update destroy]
      resources :delivery_zones, only: %i[index create update destroy] do
        collection { get :quote }
      end
      resources :riders, only: %i[index show create update destroy] do
        member do
          post :float
          get :statement
          get :settlement_preview
          post :settle
          get :settlements
          get :deliveries
        end
      end
      resources :deliveries, only: %i[index show] do
        member do
          post :assign
          post :unassign
          post :status
          post :cash
        end
      end
      get "orders/:order_id/delivery", to: "deliveries#show"
      post "orders/:order_id/delivery/assign", to: "deliveries#assign"
      post "orders/:order_id/delivery/status", to: "deliveries#status"
      get "rider/deliveries", to: "deliveries#mine"
      post "rider/deliveries/:id/status", to: "deliveries#mine_status"
      get "rider/float", to: "deliveries#mine_float"

      # Purchasing (Phase 2)
      resources :suppliers, only: %i[index show create update destroy] do
        collection do
          post :import
          get :aging_report
          get :summary
        end
        member do
          get :ledger
          get :aging
          get :insights
          get :payments
          post :payments, action: :pay
        end
      end
      resources :purchase_orders, only: %i[index show create update destroy] do
        member do
          post :send, action: :send_order
          post :cancel
          post :receive
        end
      end
      resources :goods_receipts, only: %i[index show create] do
        member { post :cancel }
      end
      resources :purchase_returns, only: %i[index show create]
      %w[summary aging suggestions forecast prices report].each { |r| get "purchasing/#{r}", to: "purchasing##{r}" }

      # Stock (Phase 2)
      resources :units, only: %i[index create update destroy]
      resources :stock_sections, only: %i[index create update destroy]
      resources :stock_items, only: %i[index show create update destroy] do
        collection do
          get :categories
          post "import/preview", action: :import_preview
          post :import
        end
        member { get :ledger }
      end
      resources :stock_documents, only: %i[index show create update destroy] do
        member do
          post :post
          post :cancel
        end
      end
      resources :recipes, only: %i[index show create update destroy] do
        collection do
          get :coverage
          get :flags
          get :food_cost
          post :recost
        end
      end
      resources :production_batches, only: %i[index create]
      resources :packaging_rules, only: %i[index create update destroy]
      get "stock/consumption", to: "stock#consumption"
      get "stock/deduction_audits", to: "stock#deduction_audits"
      get "stock/levels", to: "stock#levels"
      get "stock/valuation", to: "stock#valuation"
      get "stock/daily_sheet", to: "stock#daily_sheet"
      get "stock/waste", to: "stock#waste"
      get "stock/ledger", to: "stock#ledger"
      get "inventory_settings", to: "inventory_settings#show"
      patch "inventory_settings", to: "inventory_settings#update"
      post "inventory_settings/counting", to: "inventory_settings#counting"

      get "exports", to: "exports#index"
      get "exports/:kind", to: "exports#show", constraints: { kind: /[a-z_]+/ }
      get "billing", to: "billing#show"
      post "billing/choose_plan", to: "billing#choose_plan"
      post "billing/invoices/:id/report_payment", to: "billing#report_payment"
      post "billing/export", to: "billing#export"
      post "webhooks/paddle", to: "billing_webhooks#paddle"
      get "support_sessions", to: "support_sessions#index"
      post "support_sessions/:id/approve", to: "support_sessions#approve"
      post "support_sessions/:id/deny", to: "support_sessions#deny"
      post "onboarding/sample_menu", to: "onboarding#sample_menu"
      get "onboarding/status", to: "onboarding#status"
      get "whatsapp/templates", to: "whatsapp#templates"
      get "whatsapp/messages", to: "whatsapp#messages"
      get "whatsapp/usage", to: "whatsapp#usage"

      namespace :super do
        get "feature_flags", to: "feature_flags#index"
        put "feature_flags", to: "feature_flags#upsert"
        get "health", to: "feature_flags#health"
        get "invoices", to: "billing#invoices"
        post "invoices/:id/confirm", to: "billing#confirm"
        post "billing/run_lifecycle", to: "billing#run_lifecycle"
        post "support_sessions", to: "/api/v1/support_sessions#request_access"
        post "support_sessions/:id/token", to: "/api/v1/support_sessions#token"
        post "login", to: "sessions#create"
        get "stats", to: "businesses#stats"
        resources :businesses, only: %i[index show update]
      end
    end
  end
end
