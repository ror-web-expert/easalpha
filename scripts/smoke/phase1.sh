#!/usr/bin/env bash
# Manual-style smoke test for the Servio API, driven by curl. Run against a server started with:
#   cd servio-api && bin/rails s -p 3001
# Usage: scripts/smoke/phase1.sh [http://localhost:3001]
set -u
BASE="${1:-http://localhost:3001}/api/v1"
PASS=0; FAIL=0
STAMP=$(date +%s)
say() { printf "\n== %s\n" "$1"; }
check() { # name, expected_status, actual_status, body
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  ok   %-60s %s\n" "$1" "$3"; else FAIL=$((FAIL+1)); printf "  FAIL %-60s got %s expected %s\n  %s\n" "$1" "$3" "$2" "$(echo "$4" | head -c 300)"; fi
}
req() { # method path token body -> sets STATUS BODY
  local m=$1 p=$2 t=$3 b=${4:-}
  local out
  if [ -n "$b" ]; then
    out=$(curl -sS -o /tmp/servio_body -w "%{http_code}" -X "$m" "$BASE$p" -H "Content-Type: application/json" ${t:+-H "Authorization: Bearer $t"} -d "$b")
  else
    out=$(curl -sS -o /tmp/servio_body -w "%{http_code}" -X "$m" "$BASE$p" -H "Content-Type: application/json" ${t:+-H "Authorization: Bearer $t"})
  fi
  STATUS=$out; BODY=$(cat /tmp/servio_body)
}
jqv() { echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

say "Health"
req GET /health ""; check "GET /health" 200 "$STATUS" "$BODY"

say "Signup, login, me"
EMAIL="smoke-$STAMP@example.com"
req POST /auth/signup "" "{\"name\":\"Smoke Owner\",\"business_name\":\"Smoke Cafe $STAMP\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
check "POST /auth/signup" 201 "$STATUS" "$BODY"; TOKEN=$(jqv "['access_token']"); REFRESH=$(jqv "['refresh_token']"); BIZ=$(jqv "['business']['id']")
req POST /auth/login "" "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}"; check "POST /auth/login wrong password" 401 "$STATUS" "$BODY"
req POST /auth/login "" "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"; check "POST /auth/login" 200 "$STATUS" "$BODY"
req GET /me "$TOKEN"; check "GET /me" 200 "$STATUS" "$BODY"; BRANCH=$(jqv "['branches'][0]['id']")
req POST /auth/refresh "" "{\"refresh_token\":\"$REFRESH\"}"; check "POST /auth/refresh" 200 "$STATUS" "$BODY"
req POST /auth/refresh "" "{\"refresh_token\":\"$REFRESH\"}"; check "POST /auth/refresh reused token rejected" 401 "$STATUS" "$BODY"
req GET /me ""; check "GET /me without token" 401 "$STATUS" "$BODY"

say "Staff, roles, devices"
req GET /roles "$TOKEN"; check "GET /roles" 200 "$STATUS" "$BODY"
CASHIER_ROLE=$(echo "$BODY" | python3 -c "import sys,json; print([r['id'] for r in json.load(sys.stdin)['data'] if r['system_key']=='cashier'][0])")
MANAGER_ROLE=$(echo "$BODY" | python3 -c "import sys,json; print([r['id'] for r in json.load(sys.stdin)['data'] if r['system_key']=='manager'][0])")
req POST /staff "$TOKEN" "{\"name\":\"Haroon\",\"phone\":\"0340$((STAMP % 10000000))\",\"role_id\":\"$CASHIER_ROLE\",\"pin\":\"1111\"}"; check "POST /staff cashier" 201 "$STATUS" "$BODY"; CASHIER=$(jqv "['id']")
req POST /staff "$TOKEN" "{\"name\":\"Zeeshan\",\"email\":\"mgr-$STAMP@example.com\",\"role_id\":\"$MANAGER_ROLE\",\"pin\":\"9999\"}"; check "POST /staff manager" 201 "$STATUS" "$BODY"
req POST /devices "$TOKEN" "{\"name\":\"Counter till\",\"kind\":\"till\"}"; check "POST /devices" 201 "$STATUS" "$BODY"; CODE=$(jqv "['pairing_code']")
req POST /devices/pair "" "{\"pairing_code\":\"$CODE\",\"platform\":\"smoke\"}"; check "POST /devices/pair" 200 "$STATUS" "$BODY"; DEVTOKEN=$(jqv "['device_token']")
req POST /devices/pair "" "{\"pairing_code\":\"$CODE\"}"; check "POST /devices/pair code reused" 401 "$STATUS" "$BODY"
req POST /devices/pin_login "$DEVTOKEN" "{\"pin\":\"0000\"}"; check "POST /devices/pin_login wrong pin" 401 "$STATUS" "$BODY"
req POST /devices/pin_login "$DEVTOKEN" "{\"pin\":\"1111\"}"; check "POST /devices/pin_login cashier" 200 "$STATUS" "$BODY"; CASHTOKEN=$(jqv "['access_token']")

say "Menu"
req POST /tax_rates "$TOKEN" '{"name":"PRA 16%","rate":16,"authority":"pra","is_default":true}'; check "POST /tax_rates" 201 "$STATUS" "$BODY"
req POST /menus "$TOKEN" '{"name":"Main","is_default":true}'; check "POST /menus" 201 "$STATUS" "$BODY"; MENU=$(jqv "['id']")
req POST /categories "$TOKEN" "{\"menu_id\":\"$MENU\",\"name\":\"Burgers\"}"; check "POST /categories" 201 "$STATUS" "$BODY"; CAT=$(jqv "['id']")
req POST /modifier_groups "$TOKEN" '{"name":"Spice","max_select":1,"modifiers":[{"name":"Mild","price_minor":0},{"name":"Extra hot","price_minor":2000}]}'; check "POST /modifier_groups" 201 "$STATUS" "$BODY"; MG=$(jqv "['id']"); HOT=$(jqv "['modifiers'][1]['id']")
req POST /products "$TOKEN" "{\"category_id\":\"$CAT\",\"name\":\"Zinger Burger\",\"sku\":\"ZB-$STAMP\",\"base_price_minor\":45000,\"prices\":[{\"order_type\":\"delivery\",\"price_minor\":50000}],\"modifier_group_ids\":[\"$MG\"]}"; check "POST /products" 201 "$STATUS" "$BODY"; BURGER=$(jqv "['id']")
req POST /products "$TOKEN" "{\"category_id\":\"$CAT\",\"name\":\"Chai\",\"base_price_minor\":8000}"; check "POST /products chai" 201 "$STATUS" "$BODY"; CHAI=$(jqv "['id']")
req POST /menu/import/preview "$TOKEN" '{"source":"csv","data":"category,name,price\nStarters,Fries,230\nStarters,Nuggets,abc\n"}'; check "POST /menu/import/preview" 200 "$STATUS" "$BODY"; JOB=$(jqv "['import_job_id']")
req POST /menu/import/apply "$TOKEN" "{\"import_job_id\":\"$JOB\"}"; check "POST /menu/import/apply" 200 "$STATUS" "$BODY"
req GET /catalog "$DEVTOKEN"; check "GET /catalog as device" 200 "$STATUS" "$BODY"
req GET /menu/export "$TOKEN"; check "GET /menu/export" 200 "$STATUS" "$BODY"
req POST /menus "$CASHTOKEN" '{"name":"Hack"}'; check "POST /menus as cashier forbidden" 403 "$STATUS" "$BODY"

say "Orders and kitchen"
req POST /orders "$CASHTOKEN" "{\"order_type\":\"walk_in\",\"lines\":[{\"product_id\":\"$BURGER\",\"quantity\":2,\"modifiers\":[{\"modifier_id\":\"$HOT\"}]},{\"product_id\":\"$CHAI\"}],\"place\":true}"; check "POST /orders placed" 201 "$STATUS" "$BODY"; ORDER=$(jqv "['id']"); TOTAL=$(jqv "['total_minor']")
[ "$TOTAL" = "118320" ] && check "order total = 118320" 1 1 "" || check "order total = 118320" 118320 "$TOTAL" "$BODY"
req GET "/orders/$ORDER" "$CASHTOKEN"; check "GET /orders/:id" 200 "$STATUS" "$BODY"
req GET "/kitchen/orders" "$DEVTOKEN"; check "GET /kitchen/orders" 200 "$STATUS" "$BODY"
ITEM=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['items'][0]['id'])")
req POST "/kitchen/items/$ITEM/bump" "$DEVTOKEN"; check "POST /kitchen/items/:id/bump" 200 "$STATUS" "$BODY"
req POST "/kitchen/orders/$ORDER/bump" "$DEVTOKEN"; check "POST /kitchen/orders/:id/bump" 200 "$STATUS" "$BODY"
req GET /kitchen/ready "$DEVTOKEN"; check "GET /kitchen/ready" 200 "$STATUS" "$BODY"
req POST "/orders/$ORDER/discounts" "$CASHTOKEN" '{"kind":"percent","value":25,"reason":"Friend"}'; check "discount above cashier limit needs PIN" 403 "$STATUS" "$BODY"
req POST "/orders/$ORDER/discounts" "$CASHTOKEN" '{"kind":"percent","value":25,"reason":"Friend","approver_pin":"9999"}'; check "discount with manager PIN" 200 "$STATUS" "$BODY"
req POST "/orders/$ORDER/void" "$CASHTOKEN" '{"reason":"Customer left"}'; check "void as cashier needs PIN" 403 "$STATUS" "$BODY"
req POST "/orders/$ORDER/void" "$CASHTOKEN" '{"reason":"Customer left","approver_pin":"9999"}'; check "void with manager PIN" 200 "$STATUS" "$BODY"
req GET "/orders/summary" "$TOKEN"; check "GET /orders/summary" 200 "$STATUS" "$BODY"
req GET "/audit_logs?action_name=void" "$TOKEN"; check "GET /audit_logs void recorded" 200 "$STATUS" "$BODY"

say "Customers and tables"
req POST /customers "$TOKEN" "{\"name\":\"Hanzla Rehman\",\"phone\":\"0310$((STAMP % 10000000))\",\"addresses\":[{\"line1\":\"Room 26\",\"is_default\":true}]}"; check "POST /customers" 201 "$STATUS" "$BODY"; CUST=$(jqv "['id']"); CPHONE=$(jqv "['phone']")
req POST /customers "$TOKEN" "{\"name\":\"Dup\",\"phone\":\"$CPHONE\"}"; check "POST /customers duplicate phone" 409 "$STATUS" "$BODY"
req POST /orders "$CASHTOKEN" "{\"order_type\":\"takeaway\",\"customer_id\":\"$CUST\",\"lines\":[{\"product_id\":\"$CHAI\",\"quantity\":2}],\"place\":true}"; check "POST /orders for customer" 201 "$STATUS" "$BODY"
req GET "/customers/lookup?phone=$CPHONE" "$CASHTOKEN"; check "GET /customers/lookup repeat order" 200 "$STATUS" "$BODY"
req GET "/customers?q=hanz" "$TOKEN"; check "GET /customers search" 200 "$STATUS" "$BODY"
req POST /tables/floors "$TOKEN" '{"name":"Roof"}'; check "POST /tables/floors" 201 "$STATUS" "$BODY"; FLOOR=$(jqv "['id']")
req POST /tables "$TOKEN" "{\"code\":\"R1-1\",\"seats\":4,\"floor_id\":\"$FLOOR\"}"; check "POST /tables" 201 "$STATUS" "$BODY"; T1=$(jqv "['id']")
req POST /tables "$TOKEN" "{\"code\":\"R1-2\",\"seats\":2,\"floor_id\":\"$FLOOR\"}"; check "POST /tables second" 201 "$STATUS" "$BODY"; T2=$(jqv "['id']")
req POST /orders "$CASHTOKEN" "{\"order_type\":\"dine_in\",\"table_id\":\"$T1\",\"lines\":[{\"product_id\":\"$CHAI\"}],\"place\":true}"; check "POST /orders dine-in on table" 201 "$STATUS" "$BODY"
req GET /tables "$CASHTOKEN"; check "GET /tables shows occupied" 200 "$STATUS" "$BODY"
req POST "/tables/$T1/move" "$CASHTOKEN" "{\"to_table_id\":\"$T2\"}"; check "POST /tables/:id/move" 200 "$STATUS" "$BODY"
req DELETE "/tables/$T2" "$TOKEN"; check "DELETE occupied table refused" 409 "$STATUS" "$BODY"

say "Payments and receipts"
req POST /orders "$CASHTOKEN" "{\"order_type\":\"walk_in\",\"lines\":[{\"product_id\":\"$BURGER\"}],\"place\":true}"; PAYORDER=$(jqv "['id']"); DUE=$(jqv "['total_minor']")
req POST "/orders/$PAYORDER/payments" "$CASHTOKEN" "{\"payments\":[{\"method_code\":\"easypaisa\",\"amount_minor\":10000}]}"; check "wallet payment needs reference" 400 "$STATUS" "$BODY"
req POST "/orders/$PAYORDER/payments" "$CASHTOKEN" "{\"payments\":[{\"method_code\":\"easypaisa\",\"amount_minor\":10000,\"reference\":\"EP1\"}]}"; check "partial wallet payment" 201 "$STATUS" "$BODY"
REST=$((DUE - 10000))
req POST "/orders/$PAYORDER/payments" "$CASHTOKEN" "{\"payments\":[{\"method_code\":\"cash\",\"amount_minor\":$REST,\"tendered_minor\":100000}]}"; check "cash payment completes the order" 201 "$STATUS" "$BODY"
PSTATUS=$(jqv "['order']['payment_status']"); [ "$PSTATUS" = "paid" ] && check "order payment_status paid" 1 1 "" || check "order payment_status paid" paid "$PSTATUS" "$BODY"
req GET "/orders/$PAYORDER/receipt" "$CASHTOKEN"; check "GET receipt" 200 "$STATUS" "$BODY"
req POST "/orders/$PAYORDER/receipt/reprint" "$CASHTOKEN"; check "POST receipt reprint" 200 "$STATUS" "$BODY"
req POST "/orders/$PAYORDER/refunds" "$CASHTOKEN" '{"amount_minor":5000,"method_code":"cash","reason":"Cold"}'; check "refund as cashier needs PIN" 403 "$STATUS" "$BODY"
req POST "/orders/$PAYORDER/refunds" "$CASHTOKEN" '{"amount_minor":5000,"method_code":"cash","reason":"Cold","approver_pin":"9999"}'; check "refund with manager PIN" 201 "$STATUS" "$BODY"
req POST "/orders/$PAYORDER/void" "$TOKEN" '{"reason":"x"}'; check "void of a paid order refused" 409 "$STATUS" "$BODY"
req POST "/customers/$CUST/payments" "$TOKEN" '{"amount_minor":500,"method_code":"cash"}'; check "khata payment received" 201 "$STATUS" "$BODY"
req GET /payment_accounts "$TOKEN"; check "GET /payment_accounts" 200 "$STATUS" "$BODY"
req GET "/payments?limit=5" "$TOKEN"; check "GET /payments" 200 "$STATUS" "$BODY"

say "Shifts and day close"
req POST /shifts "$CASHTOKEN" '{"opening_cash_minor":500000}'; check "POST /shifts open" 201 "$STATUS" "$BODY"; SHIFT=$(jqv "['id']")
req POST /orders "$CASHTOKEN" "{\"order_type\":\"walk_in\",\"lines\":[{\"product_id\":\"$CHAI\"}],\"place\":true}"; SO=$(jqv "['id']"); SDUE=$(jqv "['total_minor']")
req POST "/orders/$SO/payments" "$CASHTOKEN" "{\"payments\":[{\"method_code\":\"cash\",\"amount_minor\":$SDUE,\"tendered_minor\":10000}]}"; check "cash sale on shift" 201 "$STATUS" "$BODY"
req POST "/shifts/$SHIFT/cash_movements" "$CASHTOKEN" '{"kind":"cash_out","amount_minor":2000,"reason":"Milk"}'; check "cash out with reason" 201 "$STATUS" "$BODY"
req GET "/shifts/$SHIFT/z_report" "$CASHTOKEN"; check "GET z report" 200 "$STATUS" "$BODY"
req POST "/shifts/$SHIFT/close" "$CASHTOKEN" "{\"counted_cash_minor\":$((500000 + SDUE - 2000))}"; check "blind close" 200 "$STATUS" "$BODY"
OS=$(jqv "['over_short_minor']"); [ "$OS" = "0" ] && check "over/short is 0" 1 1 "" || check "over/short is 0" 0 "$OS" "$BODY"
req POST "/shifts/$SHIFT/settle" "$TOKEN"; check "settle shift" 200 "$STATUS" "$BODY"
req GET /day_close "$TOKEN"; check "GET /day_close" 200 "$STATUS" "$BODY"

say "Tax, sync, ledger"
req PATCH "/branches/$BRANCH" "$TOKEN" '{"tax_registration":{"authority":"pra","ntn":"1234567-8","pos_id":"POS-1"}}'; check "PATCH branch tax registration" 200 "$STATUS" "$BODY"
req POST /orders "$CASHTOKEN" "{\"order_type\":\"walk_in\",\"lines\":[{\"product_id\":\"$CHAI\"}],\"place\":true}"; TO=$(jqv "['id']"); TD=$(jqv "['total_minor']")
req POST "/orders/$TO/payments" "$CASHTOKEN" "{\"payments\":[{\"method_code\":\"cash\",\"amount_minor\":$TD}]}"; check "paid order queues tax invoice" 201 "$STATUS" "$BODY"
req GET /tax_invoices/summary "$TOKEN"; check "GET /tax_invoices/summary" 200 "$STATUS" "$BODY"
req GET "/tax_invoices" "$TOKEN"; check "GET /tax_invoices" 200 "$STATUS" "$BODY"; TI=$(jqv "['data'][0]['id']")
req POST "/tax_invoices/$TI/retry" "$TOKEN"; check "POST tax invoice retry (sandbox accept)" 200 "$STATUS" "$BODY"
OID=$(python3 -c "import uuid; print(uuid.uuid4())"); PID=$(python3 -c "import uuid; print(uuid.uuid4())")
req POST /sync/push "$DEVTOKEN" "{\"records\":[{\"type\":\"order\",\"id\":\"$OID\",\"membership_id\":\"$CASHIER\",\"payload\":{\"order_type\":\"takeaway\",\"till_serial\":\"T1-099\",\"status\":\"placed\",\"lines\":[{\"product_id\":\"$CHAI\"}],\"payments\":[{\"id\":\"$PID\",\"method_code\":\"cash\",\"amount_minor\":$TD}]}}]}"; check "POST /sync/push offline order" 200 "$STATUS" "$BODY"
req POST /sync/push "$DEVTOKEN" "{\"records\":[{\"type\":\"order\",\"id\":\"$OID\",\"membership_id\":\"$CASHIER\",\"payload\":{\"order_type\":\"takeaway\",\"status\":\"placed\",\"lines\":[{\"product_id\":\"$CHAI\"}]}}]}"; check "re-push is a duplicate" 200 "$STATUS" "$BODY"
DUP=$(jqv "['results'][0]['status']"); [ "$DUP" = "duplicate" ] && check "duplicate status" 1 1 "" || check "duplicate status" duplicate "$DUP" "$BODY"
req GET /sync/changes "$DEVTOKEN"; check "GET /sync/changes" 200 "$STATUS" "$BODY"
req GET /sync/rejections "$TOKEN"; check "GET /sync/rejections" 200 "$STATUS" "$BODY"
req GET "/customers/$CUST/ledger" "$TOKEN"; check "GET customer ledger" 200 "$STATUS" "$BODY"
req GET /customers/aging "$TOKEN"; check "GET /customers/aging" 200 "$STATUS" "$BODY"

say "Isolation"
req POST /auth/signup "" "{\"name\":\"Other\",\"business_name\":\"Other Cafe $STAMP\",\"email\":\"other-$STAMP@example.com\",\"password\":\"password123\"}"; OTHER=$(jqv "['access_token']")
req GET "/orders/$ORDER" "$OTHER"; check "other business cannot read the order" 404 "$STATUS" "$BODY"
req GET "/products/$BURGER" "$OTHER"; check "other business cannot read the product" 404 "$STATUS" "$BODY"
req GET "/staff/$CASHIER" "$OTHER"; check "other business cannot read staff" 404 "$STATUS" "$BODY"

printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
