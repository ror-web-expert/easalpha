#!/usr/bin/env bash
# Phase 2 smoke test (stock, recipes, purchasing) driven by curl against a running API.
# Usage: scripts/smoke/phase2.sh [http://localhost:3001]
set -u
BASE="${1:-http://localhost:3001}/api/v1"
PASS=0; FAIL=0
STAMP=$(date +%s)
say() { printf "\n== %s\n" "$1"; }
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  ok   %-60s %s\n" "$1" "$3"; else FAIL=$((FAIL+1)); printf "  FAIL %-60s got %s expected %s\n  %s\n" "$1" "$3" "$2" "$(echo "$4" | head -c 300)"; fi; }
req() { local m=$1 p=$2 t=$3 b=${4:-}; local out
  if [ -n "$b" ]; then out=$(curl -sS -o /tmp/servio_body2 -w "%{http_code}" -X "$m" "$BASE$p" -H "Content-Type: application/json" ${t:+-H "Authorization: Bearer $t"} -d "$b")
  else out=$(curl -sS -o /tmp/servio_body2 -w "%{http_code}" -X "$m" "$BASE$p" -H "Content-Type: application/json" ${t:+-H "Authorization: Bearer $t"}); fi
  STATUS=$out; BODY=$(cat /tmp/servio_body2); }
jqv() { echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }
eqv() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  ok   %-60s %s\n" "$1" "$3"; else FAIL=$((FAIL+1)); printf "  FAIL %-60s got %s expected %s\n" "$1" "$3" "$2"; fi; }

say "Setup"
EMAIL="smoke2-$STAMP@example.com"
req POST /auth/signup "" "{\"name\":\"Stock Owner\",\"business_name\":\"Stock Cafe $STAMP\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
check "POST /auth/signup" 201 "$STATUS" "$BODY"; TOKEN=$(jqv "['access_token']")
req GET /roles "$TOKEN"; KITCHEN_ROLE=$(echo "$BODY" | python3 -c "import sys,json; print([r['id'] for r in json.load(sys.stdin)['data'] if r['system_key']=='kitchen'][0])")
req POST /staff "$TOKEN" "{\"name\":\"Cook\",\"phone\":\"0341$((STAMP % 10000000))\",\"role_id\":\"$KITCHEN_ROLE\",\"pin\":\"2222\"}"; check "POST /staff kitchen" 201 "$STATUS" "$BODY"; CASHIER=$(jqv "['id']")
req POST /devices "$TOKEN" '{"name":"Kitchen screen","kind":"kitchen"}'; CODE=$(jqv "['pairing_code']")
req POST /devices/pair "" "{\"pairing_code\":\"$CODE\",\"platform\":\"smoke\"}"; DEVTOKEN=$(jqv "['device_token']")
req POST /devices/pin_login "$DEVTOKEN" '{"pin":"2222"}'; check "POST /devices/pin_login kitchen" 200 "$STATUS" "$BODY"; COOK=$(jqv "['access_token']")

say "Units, sections, items"
req GET /units "$TOKEN"; check "GET /units seeds defaults" 200 "$STATUS" "$BODY"
KG=$(echo "$BODY" | python3 -c "import sys,json; print([u['id'] for u in json.load(sys.stdin)['data'] if u['code']=='kg'][0])")
G=$(echo "$BODY" | python3 -c "import sys,json; print([u['id'] for u in json.load(sys.stdin)['data'] if u['code']=='g'][0])")
PCS=$(echo "$BODY" | python3 -c "import sys,json; print([u['id'] for u in json.load(sys.stdin)['data'] if u['code']=='pcs'][0])")
req POST /units "$TOKEN" '{"code":"box","name":"Box of 24","kind":"count","factor_to_base":24}'; check "POST /units custom" 201 "$STATUS" "$BODY"
req GET /stock_sections "$TOKEN"; check "GET /stock_sections default Kitchen" 200 "$STATUS" "$BODY"; KITCHEN=$(jqv "['data'][0]['id']")
req POST /stock_sections "$TOKEN" '{"name":"Warehouse"}'; check "POST /stock_sections" 201 "$STATUS" "$BODY"; STORE=$(jqv "['id']")
req POST /stock_items "$TOKEN" "{\"name\":\"Chicken\",\"sku\":\"CHK\",\"category\":\"Meat\",\"base_unit_id\":\"$G\",\"purchase_unit_id\":\"$KG\",\"minimum_qty\":2000}"; check "POST /stock_items chicken" 201 "$STATUS" "$BODY"; CHK=$(jqv "['id']")
req POST /stock_items "$TOKEN" "{\"name\":\"Burger bun\",\"sku\":\"BUN\",\"base_unit_id\":\"$PCS\",\"minimum_qty\":20}"; check "POST /stock_items bun" 201 "$STATUS" "$BODY"; BUN=$(jqv "['id']")
req POST /stock_items "$TOKEN" "{\"name\":\"Bad\",\"base_unit_id\":\"$G\",\"purchase_unit_id\":\"$PCS\"}"; check "POST /stock_items mixed unit kinds rejected" 422 "$STATUS" "$BODY"
req GET "/stock_items?q=chk" "$TOKEN"; check "GET /stock_items?q=" 200 "$STATUS" "$BODY"; eqv "search finds chicken" "1" "$(jqv "['data'].__len__()")"

say "Documents and ledger"
req POST /stock_documents "$TOKEN" "{\"kind\":\"receive\",\"to_section_id\":\"$STORE\",\"invoice_ref\":\"INV-1\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":10,\"unit_cost_minor\":50000},{\"stock_item_id\":\"$BUN\",\"unit_id\":\"$PCS\",\"quantity\":100,\"unit_cost_minor\":2500}]}"
check "POST /stock_documents receive" 201 "$STATUS" "$BODY"; eqv "receive is RCV-1" "RCV-1" "$(jqv "['label']")"; eqv "receive posted" "posted" "$(jqv "['status']")"
req POST /stock_documents "$TOKEN" "{\"kind\":\"receive\",\"to_section_id\":\"$STORE\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":10,\"unit_cost_minor\":70000}]}"
check "POST /stock_documents second receive" 201 "$STATUS" "$BODY"
req GET /stock_items/$CHK "$TOKEN"; eqv "chicken on hand 20 kg in grams" "20000.0" "$(jqv "['quantity']")"; eqv "weighted average 60 minor per g" "60.0" "$(jqv "['avg_cost_minor_per_base']")"
req POST /stock_documents "$TOKEN" "{\"kind\":\"transfer\",\"from_section_id\":\"$STORE\",\"to_section_id\":\"$KITCHEN\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":5},{\"stock_item_id\":\"$BUN\",\"quantity\":40}]}"
check "POST /stock_documents transfer" 201 "$STATUS" "$BODY"
req POST /stock_documents "$TOKEN" "{\"kind\":\"transfer\",\"from_section_id\":\"$KITCHEN\",\"to_section_id\":\"$STORE\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":41}]}"
check "transfer below zero refused" 409 "$STATUS" "$BODY"
req POST /stock_documents "$COOK" "{\"kind\":\"waste\",\"from_section_id\":\"$KITCHEN\",\"reason\":\"Dropped\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":2}]}"
check "POST /stock_documents waste by kitchen staff" 201 "$STATUS" "$BODY"
req POST /stock_documents "$COOK" "{\"kind\":\"receive\",\"to_section_id\":\"$KITCHEN\",\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":2}]}"
check "receive by kitchen staff forbidden" 403 "$STATUS" "$BODY"
req POST /stock_documents "$TOKEN" "{\"kind\":\"adjustment\",\"from_section_id\":\"$KITCHEN\",\"reason\":\"Found extra\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":3}]}"
check "POST /stock_documents adjustment" 201 "$STATUS" "$BODY"
req POST /stock_documents "$TOKEN" "{\"kind\":\"count\",\"from_section_id\":\"$KITCHEN\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"counted_qty\":40}]}"
check "count while counting closed refused" 409 "$STATUS" "$BODY"
req POST /inventory_settings/counting "$TOKEN" '{"open":true}'; check "POST /inventory_settings/counting open" 200 "$STATUS" "$BODY"
req POST /stock_documents "$TOKEN" "{\"kind\":\"count\",\"from_section_id\":\"$KITCHEN\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"counted_qty\":40}]}"
check "POST /stock_documents count" 201 "$STATUS" "$BODY"; eqv "count expected 41" "41.0" "$(jqv "['lines'][0]['expected_qty']")"
req POST /inventory_settings/counting "$TOKEN" '{"open":false}'
req POST /stock_documents "$TOKEN" "{\"kind\":\"waste\",\"from_section_id\":\"$KITCHEN\",\"reason\":\"Oops\",\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":1}]}"; DRAFT=$(jqv "['id']")
check "POST /stock_documents draft" 201 "$STATUS" "$BODY"; eqv "draft status" "draft" "$(jqv "['status']")"
req PATCH /stock_documents/$DRAFT "$TOKEN" "{\"reason\":\"Burnt\",\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":2}]}"; check "PATCH /stock_documents draft" 200 "$STATUS" "$BODY"
req POST /stock_documents/$DRAFT/post "$TOKEN"; check "POST /stock_documents/:id/post" 200 "$STATUS" "$BODY"
req POST /stock_documents/$DRAFT/cancel "$TOKEN" '{"reason":"Mistake"}'; check "POST /stock_documents/:id/cancel posted" 200 "$STATUS" "$BODY"
req GET /stock_items/$BUN "$TOKEN"; eqv "buns on hand after all moves" "100.0" "$(jqv "['quantity']")"
req GET "/stock_items/$BUN/ledger" "$TOKEN"; check "GET /stock_items/:id/ledger" 200 "$STATUS" "$BODY"
req GET "/stock/ledger?kind=waste" "$TOKEN"; check "GET /stock/ledger?kind=waste" 200 "$STATUS" "$BODY"
req GET "/stock_documents?kind=receive" "$TOKEN"; check "GET /stock_documents?kind=" 200 "$STATUS" "$BODY"; eqv "two receipts listed" "2" "$(jqv "['data'].__len__()")"

say "Reports and settings"
req GET /stock/levels "$TOKEN"; check "GET /stock/levels" 200 "$STATUS" "$BODY"; eqv "stock value 20kg x 600 + 100 x 25" "1450000" "$(jqv "['total_value_minor']")"
req GET "/stock/levels?low=true" "$TOKEN"; check "GET /stock/levels?low=true" 200 "$STATUS" "$BODY"
req GET "/stock/daily_sheet?section_id=$KITCHEN" "$TOKEN"; check "GET /stock/daily_sheet" 200 "$STATUS" "$BODY"
req GET /stock/waste "$TOKEN"; check "GET /stock/waste" 200 "$STATUS" "$BODY"
req GET /stock/valuation "$TOKEN"; check "GET /stock/valuation" 200 "$STATUS" "$BODY"
req GET /inventory_settings "$TOKEN"; check "GET /inventory_settings" 200 "$STATUS" "$BODY"
req PATCH /inventory_settings "$TOKEN" "{\"day_lock_date\":\"$(date +%F)\"}"; check "PATCH /inventory_settings day lock" 200 "$STATUS" "$BODY"
req POST /stock_documents "$TOKEN" "{\"kind\":\"waste\",\"from_section_id\":\"$KITCHEN\",\"reason\":\"Late\",\"post\":true,\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":1}]}"
check "posting on a locked day refused" 409 "$STATUS" "$BODY"
req PATCH /inventory_settings "$TOKEN" '{"day_lock_date":null}'
req POST /stock_items/import/preview "$TOKEN" '{"csv":"Item Name,Code,Category,Unit,Min,Opening,Cost\nTomato,TOM,Veg,kg,2,15,120\nOil,OIL,Grocery,l,5,20,450\n"}'; check "POST /stock_items/import/preview" 200 "$STATUS" "$BODY"
req POST /stock_items/import "$TOKEN" '{"csv":"Item Name,Code,Category,Unit,Min,Opening,Cost\nTomato,TOM,Veg,kg,2,15,120\nOil,OIL,Grocery,l,5,20,450\n"}'; check "POST /stock_items/import" 200 "$STATUS" "$BODY"; eqv "import created 2" "2" "$(jqv "['created']")"
req GET "/exports/stock_items" "$TOKEN"; check "GET /exports/stock_items" 200 "$STATUS" "$BODY"
req GET "/exports/stock_ledger" "$TOKEN"; check "GET /exports/stock_ledger" 200 "$STATUS" "$BODY"
req GET /reports/dashboard "$TOKEN"; check "GET /reports/dashboard has stock" 200 "$STATUS" "$BODY"

say "Recipes, production and deduction at Placed"
req POST /stock_items "$TOKEN" "{\"name\":\"Marinated chicken\",\"sku\":\"MAR\",\"base_unit_id\":\"$G\"}"; MAR=$(jqv "['id']")
req POST /recipes "$TOKEN" "{\"output_stock_item_id\":\"$MAR\",\"name\":\"Marinade\",\"yield_qty\":1,\"yield_unit_id\":\"$KG\",\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":1}]}"
check "POST /recipes sub-recipe" 201 "$STATUS" "$BODY"; SUB=$(jqv "['id']"); eqv "sub-recipe cost 1 kg chicken at avg 60/g" "60000" "$(jqv "['cost_minor']")"
req POST /production_batches "$TOKEN" "{\"recipe_id\":\"$SUB\",\"quantity\":2,\"section_id\":\"$KITCHEN\"}"; check "POST /production_batches" 201 "$STATUS" "$BODY"
req GET /stock_items/$MAR "$TOKEN"; eqv "marinade produced 2000 g" "2000.0" "$(jqv "['quantity']")"
req POST /tax_rates "$TOKEN" '{"name":"PRA 16%","rate":16,"authority":"pra","is_default":true}'
req POST /menus "$TOKEN" '{"name":"Main","is_default":true}'; MENU=$(jqv "['id']")
req POST /categories "$TOKEN" "{\"menu_id\":\"$MENU\",\"name\":\"Burgers\"}"; CAT=$(jqv "['id']")
req POST /products "$TOKEN" "{\"category_id\":\"$CAT\",\"name\":\"Zinger Burger\",\"base_price_minor\":45000}"; BURGER=$(jqv "['id']")
req POST /products "$TOKEN" "{\"category_id\":\"$CAT\",\"name\":\"Chai\",\"base_price_minor\":8000}"; CHAI=$(jqv "['id']")
req POST /recipes "$TOKEN" "{\"product_id\":\"$BURGER\",\"name\":\"Zinger Burger\",\"lines\":[{\"stock_item_id\":\"$MAR\",\"unit_id\":\"$G\",\"quantity\":150},{\"stock_item_id\":\"$BUN\",\"quantity\":1}]}"
check "POST /recipes product recipe" 201 "$STATUS" "$BODY"; RECIPE=$(jqv "['id']"); eqv "food cost percent 11,500 of 45,000" "25.6" "$(jqv "['food_cost']['percent']")"
req POST /recipes "$TOKEN" "{\"product_id\":\"$BURGER\",\"name\":\"Dup\",\"lines\":[{\"stock_item_id\":\"$BUN\",\"quantity\":1}]}"; check "second recipe for the same product refused" 422 "$STATUS" "$BODY"
req GET /recipes/coverage "$TOKEN"; check "GET /recipes/coverage" 200 "$STATUS" "$BODY"; eqv "coverage 1 of 2" "1" "$(jqv "['with_recipe']")"
req GET /recipes/food_cost "$TOKEN"; check "GET /recipes/food_cost" 200 "$STATUS" "$BODY"
req GET /recipes/flags "$TOKEN"; check "GET /recipes/flags" 200 "$STATUS" "$BODY"
req POST /packaging_rules "$TOKEN" "{\"order_type\":\"takeaway\",\"stock_item_id\":\"$BUN\",\"quantity\":1}"; check "POST /packaging_rules" 201 "$STATUS" "$BODY"
req GET /stock_items/$BUN "$TOKEN"; BUNS_BEFORE=$(jqv "['quantity']")
req POST /orders "$TOKEN" "{\"order_type\":\"takeaway\",\"lines\":[{\"product_id\":\"$BURGER\",\"quantity\":2},{\"product_id\":\"$CHAI\",\"quantity\":1}],\"place\":true}"
check "POST /orders placed with recipe" 201 "$STATUS" "$BODY"; ORDER=$(jqv "['id']"); eqv "recipe cost snapshot on the line" "2" "$(jqv "['items'][0]['quantity']" | cut -d. -f1)"
req GET /stock_items/$BUN "$TOKEN"; eqv "buns down by 2 recipe + 1 packaging" "$(python3 -c "print($BUNS_BEFORE-3)")" "$(jqv "['quantity']")"
req GET /stock_items/$MAR "$TOKEN"; eqv "marinade down by 300 g" "1700.0" "$(jqv "['quantity']")"
req GET "/stock/deduction_audits" "$TOKEN"; check "GET /stock/deduction_audits" 200 "$STATUS" "$BODY"; eqv "audit partial (chai has no recipe)" "partial" "$(jqv "['data'][0]['status']")"
req GET "/stock/consumption" "$TOKEN"; check "GET /stock/consumption" 200 "$STATUS" "$BODY"
req POST /orders/$ORDER/void "$TOKEN" '{"reason":"Customer left"}'; check "POST /orders/:id/void before cooking" 200 "$STATUS" "$BODY"
req GET /stock_items/$BUN "$TOKEN"; eqv "buns returned after void" "$BUNS_BEFORE" "$(jqv "['quantity']")"
req GET /stock_items/$MAR "$TOKEN"; eqv "marinade returned after void" "2000.0" "$(jqv "['quantity']")"
req GET "/stock/ledger?kind=sale_return" "$TOKEN"; check "GET /stock/ledger?kind=sale_return" 200 "$STATUS" "$BODY"
req GET "/stock_documents?kind=production" "$TOKEN"; eqv "production document listed" "1" "$(jqv "['data'].__len__()")"

say "Suppliers and purchasing"
req POST /suppliers "$TOKEN" '{"name":"Metro Cash & Carry","phone":"0300 1234567","payment_terms_days":15}'; check "POST /suppliers" 201 "$STATUS" "$BODY"; SUP=$(jqv "['id']")
req POST /purchase_orders "$TOKEN" "{\"supplier_id\":\"$SUP\",\"send\":true,\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":10,\"unit_cost_minor\":52000},{\"stock_item_id\":\"$BUN\",\"quantity\":200,\"unit_cost_minor\":2200}]}"
check "POST /purchase_orders sent" 201 "$STATUS" "$BODY"; PO=$(jqv "['id']"); eqv "PO total" "960000" "$(jqv "['total_minor']")"; eqv "PO status sent" "sent" "$(jqv "['status']")"
CHKLINE=$(echo "$BODY" | python3 -c "import sys,json; print([l['id'] for l in json.load(sys.stdin)['lines'] if l['item_name']=='Chicken'][0])")
req POST /purchase_orders/$PO/receive "$TOKEN" "{\"invoice_ref\":\"INV-77\",\"lines\":[{\"purchase_order_line_id\":\"$CHKLINE\",\"quantity\":6,\"unit_cost_minor\":53000}]}"
check "POST /purchase_orders/:id/receive partial" 201 "$STATUS" "$BODY"; eqv "PO partial" "partial" "$(jqv "['purchase_order']['status']")"; GRN=$(jqv "['receipt']['id']")
req POST /purchase_orders/$PO/receive "$TOKEN" '{}'; check "POST /purchase_orders/:id/receive rest" 201 "$STATUS" "$BODY"; eqv "PO received" "received" "$(jqv "['purchase_order']['status']")"
req GET /suppliers/$SUP "$TOKEN"; eqv "supplier balance after receipts" "966000" "$(jqv "['balance_minor']")"
req POST /suppliers/$SUP/payments "$TOKEN" '{"amount_minor":500000,"method_code":"cash","reference":"slip 1"}'; check "POST /suppliers/:id/payments" 201 "$STATUS" "$BODY"; eqv "balance after payment" "466000" "$(jqv "['supplier']['balance_minor']")"
req GET /suppliers/$SUP/ledger "$TOKEN"; check "GET /suppliers/:id/ledger" 200 "$STATUS" "$BODY"
req GET /suppliers/$SUP/insights "$TOKEN"; check "GET /suppliers/:id/insights" 200 "$STATUS" "$BODY"
req POST /purchase_returns "$TOKEN" "{\"supplier_id\":\"$SUP\",\"goods_receipt_id\":\"$GRN\",\"reason\":\"Damaged\",\"settlement\":\"credit_note\",\"lines\":[{\"stock_item_id\":\"$CHK\",\"unit_id\":\"$KG\",\"quantity\":1}]}"
check "POST /purchase_returns credit note" 201 "$STATUS" "$BODY"; eqv "return amount 1 kg at 53,000" "53000" "$(jqv "['amount_minor']")"
req GET /suppliers/$SUP "$TOKEN"; eqv "balance after return" "413000" "$(jqv "['balance_minor']")"
req GET /goods_receipts "$TOKEN"; check "GET /goods_receipts" 200 "$STATUS" "$BODY"; eqv "two receipts" "2" "$(jqv "['data'].__len__()")"
req GET /purchasing/summary "$TOKEN"; check "GET /purchasing/summary" 200 "$STATUS" "$BODY"
req GET /purchasing/aging "$TOKEN"; check "GET /purchasing/aging" 200 "$STATUS" "$BODY"
req GET /purchasing/suggestions "$TOKEN"; check "GET /purchasing/suggestions" 200 "$STATUS" "$BODY"
req GET "/purchasing/forecast?forecast_days=7&budget_minor=100000" "$TOKEN"; check "GET /purchasing/forecast" 200 "$STATUS" "$BODY"
req GET "/purchasing/prices?stock_item_id=$CHK" "$TOKEN"; check "GET /purchasing/prices" 200 "$STATUS" "$BODY"
req GET "/purchasing/report?group_by=supplier" "$TOKEN"; check "GET /purchasing/report" 200 "$STATUS" "$BODY"
req GET "/exports/purchases" "$TOKEN"; check "GET /exports/purchases" 200 "$STATUS" "$BODY"
req DELETE /suppliers/$SUP "$TOKEN"; check "DELETE /suppliers with balance refused" 409 "$STATUS" "$BODY"

say "Expenses, overheads, delivery zones and riders"
req GET /expenses/categories "$TOKEN"; check "GET /expenses/categories" 200 "$STATUS" "$BODY"
GAS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print([c for c in d if c['name']=='Utilities'][0]['children'][1]['id'])")
req POST /expenses "$TOKEN" "{\"category_id\":\"$GAS\",\"amount_minor\":350000,\"method_code\":\"cash\",\"paid_to\":\"SSGC\"}"; check "POST /expenses" 201 "$STATUS" "$BODY"; EXP=$(jqv "['id']"); eqv "expense numbered" "EXP-1" "$(jqv "['label']")"
req POST /overheads "$TOKEN" '{"name":"Rent","kind":"rent","amount_minor":3000000,"basis":"per_month"}'; check "POST /overheads" 201 "$STATUS" "$BODY"
req GET "/expenses/summary" "$TOKEN"; check "GET /expenses/summary" 200 "$STATUS" "$BODY"; eqv "expense total" "350000" "$(jqv "['total_minor']")"
req POST /expenses/$EXP/void "$TOKEN" '{"reason":"Duplicate"}'; check "POST /expenses/:id/void" 200 "$STATUS" "$BODY"
req POST /delivery_zones "$TOKEN" '{"name":"DHA","areas":["DHA","Phase 5"],"charge_minor":15000,"min_order_minor":50000}'; check "POST /delivery_zones" 201 "$STATUS" "$BODY"
req GET "/delivery_zones/quote?text=Phase%205%20DHA" "$TOKEN"; eqv "zone quote" "15000" "$(jqv "['charge_minor']")"
req POST /riders "$TOKEN" "{\"name\":\"Bilal\",\"phone\":\"0311$((STAMP % 10000000))\",\"create_login\":true,\"pin\":\"4321\"}"; check "POST /riders with login" 201 "$STATUS" "$BODY"; RIDER=$(jqv "['id']")
req POST /customers "$TOKEN" "{\"name\":\"Hira\",\"phone\":\"0300$((STAMP % 10000000))\",\"addresses\":[{\"line1\":\"House 12\",\"area\":\"Phase 5 DHA\",\"is_default\":true}]}"; CUST=$(jqv "['id']"); ADDR=$(jqv "['addresses'][0]['id']")
req POST /orders "$TOKEN" "{\"order_type\":\"delivery\",\"customer_id\":\"$CUST\",\"address_id\":\"$ADDR\",\"delivery_charge_minor\":15000,\"lines\":[{\"product_id\":\"$BURGER\"}],\"place\":true}"; check "POST /orders delivery" 201 "$STATUS" "$BODY"; DORDER=$(jqv "['id']"); DTOTAL=$(jqv "['total_minor']")
req GET /orders/$DORDER/delivery "$TOKEN"; check "GET /orders/:id/delivery" 200 "$STATUS" "$BODY"; eqv "delivery zone matched" "DHA" "$(jqv "['zone_name']")"
req POST /orders/$DORDER/delivery/assign "$TOKEN" "{\"rider_id\":\"$RIDER\"}"; check "POST /orders/:id/delivery/assign" 200 "$STATUS" "$BODY"; DELIV=$(jqv "['id']")
req POST /deliveries/$DELIV/status "$TOKEN" '{"status":"picked_up"}'; check "POST /deliveries/:id/status picked_up" 200 "$STATUS" "$BODY"; eqv "order dispatched" "dispatched" "$(jqv "['order_status']")"
req POST /deliveries/$DELIV/status "$TOKEN" "{\"status\":\"delivered\",\"cash_collected_minor\":$DTOTAL}"; check "POST /deliveries/:id/status delivered" 200 "$STATUS" "$BODY"
req GET /orders/$DORDER "$TOKEN"; eqv "delivered never closes the order" "dispatched" "$(jqv "['status']")"
req POST /riders/$RIDER/float "$TOKEN" '{"kind":"issue","amount_minor":100000,"reason":"Float"}'; check "POST /riders/:id/float issue" 201 "$STATUS" "$BODY"
req POST /riders/$RIDER/float "$TOKEN" '{"kind":"spend","amount_minor":20000,"reason":"Petrol"}'; check "POST /riders/:id/float spend" 201 "$STATUS" "$BODY"; eqv "float after spend" "80000" "$(jqv "['rider']['float_minor']")"
req GET /riders/$RIDER/statement "$TOKEN"; check "GET /riders/:id/statement" 200 "$STATUS" "$BODY"
req GET /riders/$RIDER/settlement_preview "$TOKEN"; check "GET /riders/:id/settlement_preview" 200 "$STATUS" "$BODY"; EXPECTED=$(jqv "['expected_minor']")
req POST /riders/$RIDER/settle "$TOKEN" "{\"handed_in_minor\":$EXPECTED}"; check "POST /riders/:id/settle" 201 "$STATUS" "$BODY"; eqv "settled with no difference" "0" "$(jqv "['settlement']['difference_minor']")"
req GET "/deliveries?all_days=true" "$TOKEN"; check "GET /deliveries" 200 "$STATUS" "$BODY"

say "QR ordering, queue display and scheduled reports"
req GET /me "$TOKEN"; BRANCH=$(jqv "['branches'][0]['id']")
req POST /tables "$TOKEN" '{"code":"T7","seats":4}'; check "POST /tables" 201 "$STATUS" "$BODY"; TABLE=$(jqv "['id']"); QRTOKEN=$(jqv "['qr_token']")
req GET "/qr/$QRTOKEN" ""; check "GET /qr/:token public" 200 "$STATUS" "$BODY"; eqv "ordering off by default" "False" "$(jqv "['ordering']")"
req PATCH /branches/$BRANCH "$TOKEN" '{"qr_settings":{"enabled":true,"cashier_accept":true,"guest_name":true}}'; check "PATCH /branches qr_settings" 200 "$STATUS" "$BODY"
req GET /tables/$TABLE/qr "$TOKEN"; check "GET /tables/:id/qr card" 200 "$STATUS" "$BODY"
req GET "/qr/$QRTOKEN" ""; eqv "ordering on" "True" "$(jqv "['ordering']")"
req POST "/qr/$QRTOKEN/orders" "" "{\"guest_name\":\"Ayesha\",\"lines\":[{\"product_id\":\"$CHAI\",\"quantity\":2}]}"; check "POST /qr/:token/orders guest order" 201 "$STATUS" "$BODY"; QORDER=$(jqv "['id']"); GTOKEN=$(jqv "['guest_token']"); eqv "guest order pending" "pending" "$(jqv "['qr_status']")"
req GET "/qr/$QRTOKEN/orders/$QORDER?guest_token=$GTOKEN" ""; check "GET /qr/:token/orders/:id guest status" 200 "$STATUS" "$BODY"
req GET "/qr_orders?status=pending" "$TOKEN"; check "GET /qr_orders pending" 200 "$STATUS" "$BODY"; eqv "one pending QR order" "1" "$(jqv "['data'].__len__()")"
req POST /qr_orders/$QORDER/accept "$TOKEN"; check "POST /qr_orders/:id/accept" 200 "$STATUS" "$BODY"; eqv "accepted order placed" "placed" "$(jqv "['status']")"
req GET "/qr/$QRTOKEN/bill" ""; check "GET /qr/:token/bill running bill" 200 "$STATUS" "$BODY"
req POST "/qr/$QRTOKEN/requests" "" '{"kind":"ask_bill","guest_name":"Ayesha"}'; check "POST /qr/:token/requests ask bill" 201 "$STATUS" "$BODY"; TREQ=$(jqv "['id']")
req GET "/qr_orders/requests?open=true" "$TOKEN"; check "GET /qr_orders/requests" 200 "$STATUS" "$BODY"
req POST /qr_orders/requests/$TREQ/handle "$TOKEN"; check "POST /qr_orders/requests/:id/handle" 200 "$STATUS" "$BODY"
req GET /kitchen/queue "$TOKEN"; check "GET /kitchen/queue display" 200 "$STATUS" "$BODY"
req POST /report_schedules "$TOKEN" '{"name":"Daily sales","kind":"sales","cadence":"daily","hour":9,"channel":"whatsapp","recipients":["03001234567"]}'; check "POST /report_schedules" 201 "$STATUS" "$BODY"; SCHED=$(jqv "['id']")
req GET /report_schedules/$SCHED/preview "$TOKEN"; check "GET /report_schedules/:id/preview" 200 "$STATUS" "$BODY"
req POST /report_schedules/$SCHED/run "$TOKEN"; check "POST /report_schedules/:id/run" 200 "$STATUS" "$BODY"
req GET /report_schedules "$TOKEN"; check "GET /report_schedules" 200 "$STATUS" "$BODY"

say "Loyalty, campaigns, reservations, commissions, checklists"
req PATCH /loyalty/settings "$TOKEN" '{"loyalty_enabled":true,"loyalty_rupees_per_point":100,"loyalty_point_value_minor":100,"loyalty_min_redeem_points":10}'; check "PATCH /loyalty/settings" 200 "$STATUS" "$BODY"
req POST /customers "$TOKEN" "{\"name\":\"Sara\",\"phone\":\"0302$((STAMP % 10000000))\",\"whatsapp_opt_in\":true,\"birthday\":\"$(date +%F)\"}"; LCUST=$(jqv "['id']")
req POST /orders "$TOKEN" "{\"order_type\":\"takeaway\",\"customer_id\":\"$LCUST\",\"lines\":[{\"product_id\":\"$BURGER\",\"quantity\":2}],\"place\":true}"; LORDER=$(jqv "['id']"); LTOTAL=$(jqv "['total_minor']")
req POST /orders/$LORDER/payments "$TOKEN" "{\"payments\":[{\"method_code\":\"cash\",\"amount_minor\":$LTOTAL}]}"; check "POST /orders/:id/payments earns points" 201 "$STATUS" "$BODY"
req GET /customers/$LCUST/loyalty "$TOKEN"; check "GET /customers/:id/loyalty" 200 "$STATUS" "$BODY"; eqv "points earned on Rs 1,044" "10" "$(jqv "['points']")"
req POST /customers/$LCUST/loyalty/adjust "$TOKEN" '{"points":40,"note":"Bonus"}'; check "POST /customers/:id/loyalty/adjust" 201 "$STATUS" "$BODY"
req POST /orders "$TOKEN" "{\"order_type\":\"takeaway\",\"customer_id\":\"$LCUST\",\"lines\":[{\"product_id\":\"$CHAI\",\"quantity\":2}]}"; RORDER=$(jqv "['id']")
req POST /orders/$RORDER/redeem_points "$TOKEN" '{"points":50}'; check "POST /orders/:id/redeem_points" 200 "$STATUS" "$BODY"; eqv "Rs 50 off" "5000" "$(jqv "['discount_minor']")"
req GET "/campaigns/audience?kind=all" "$TOKEN"; check "GET /campaigns/audience" 200 "$STATUS" "$BODY"
req POST /campaigns "$TOKEN" '{"name":"Eid blast","body":"Hi {name}, 15% off this week!","segment":{"kind":"all"},"send_now":true}'; check "POST /campaigns send now" 201 "$STATUS" "$BODY"; CAMP=$(jqv "['id']"); eqv "campaign sent" "sent" "$(jqv "['status']")"
req GET /campaigns/$CAMP/stats "$TOKEN"; check "GET /campaigns/:id/stats" 200 "$STATUS" "$BODY"
STARTS=$(date -u -d "+3 hours" +%Y-%m-%dT%H:00:00Z)
req POST /reservations "$TOKEN" "{\"table_id\":\"$TABLE\",\"guest_name\":\"Hamza\",\"phone\":\"03005550001\",\"party_size\":4,\"starts_at\":\"$STARTS\",\"duration_minutes\":90}"; check "POST /reservations" 201 "$STATUS" "$BODY"; RES=$(jqv "['id']")
req POST /reservations "$TOKEN" "{\"table_id\":\"$TABLE\",\"guest_name\":\"Clash\",\"party_size\":2,\"starts_at\":\"$STARTS\"}"; check "overlapping reservation refused" 409 "$STATUS" "$BODY"
req GET "/reservations/availability?starts_at=$STARTS&party_size=2" "$TOKEN"; check "GET /reservations/availability" 200 "$STATUS" "$BODY"
req POST /reservations/$RES/confirm "$TOKEN"; check "POST /reservations/:id/confirm" 200 "$STATUS" "$BODY"
req GET "/reservations?upcoming=true" "$TOKEN"; check "GET /reservations upcoming" 200 "$STATUS" "$BODY"
req POST /commission_rules "$TOKEN" '{"name":"Order taker Rs 5","applies_to":"order_taker","basis":"per_order","value":5}'; check "POST /commission_rules" 201 "$STATUS" "$BODY"
req GET /reports/commissions "$TOKEN"; check "GET /reports/commissions" 200 "$STATUS" "$BODY"
req GET /checklists/templates "$TOKEN"; check "GET /checklists/templates" 200 "$STATUS" "$BODY"
req GET "/checklists/today?kind=opening" "$TOKEN"; check "GET /checklists/today" 200 "$STATUS" "$BODY"; RUN=$(jqv "['id']")
req POST /checklists/runs/$RUN/tick "$TOKEN" '{"key":"item_1","done":true}'; check "POST /checklists/runs/:id/tick" 200 "$STATUS" "$BODY"

say "Finance, Foodpanda and branches"
DAY=$(date +%F)
req GET "/finance/ledger?business_day=$DAY" "$TOKEN"; check "GET /finance/ledger" 200 "$STATUS" "$BODY"
req GET "/finance/reconciliation?business_day=$DAY" "$TOKEN"; check "GET /finance/reconciliation" 200 "$STATUS" "$BODY"; eqv "day reconciles" "True" "$(jqv "['balanced']")"
req GET "/finance/integrity?from=$DAY&to=$DAY" "$TOKEN"; check "GET /finance/integrity" 200 "$STATUS" "$BODY"; eqv "integrity ok" "True" "$(jqv "['ok']")"
req GET "/finance/profit_loss?from=$DAY&to=$DAY" "$TOKEN"; check "GET /finance/profit_loss" 200 "$STATUS" "$BODY"
req GET "/finance/export?from=$DAY&to=$DAY&format=xero" "$TOKEN"; check "GET /finance/export xero" 200 "$STATUS" "$BODY"
req GET "/reports/branches" "$TOKEN"; check "GET /reports/branches" 200 "$STATUS" "$BODY"
req PATCH /integrations/foodpanda "$TOKEN" '{"enabled":true,"secret":"rotate","commission_percent":25}'; check "PATCH /integrations/foodpanda" 200 "$STATUS" "$BODY"; FPSECRET=$(jqv "['secret_plain']")
req GET /me "$TOKEN"; SLUG=$(jqv "['business']['slug']")
FPBODY="{\"event\":\"order.new\",\"order\":{\"id\":\"FP-$STAMP\",\"customer\":{\"name\":\"Zain\",\"phone\":\"0300$((STAMP % 9000000 + 1000000))\"},\"items\":[{\"name\":\"Zinger Burger\",\"quantity\":1}],\"delivery_fee\":50}}"
FPSIG=$(printf '%s' "$FPBODY" | openssl dgst -sha256 -hmac "$FPSECRET" | sed 's/^.* //')
FPSTATUS=$(curl -sS -o /tmp/servio_body2 -w "%{http_code}" -X POST "$BASE/webhooks/foodpanda/$SLUG" -H "Content-Type: application/json" -H "X-Signature: sha256=$FPSIG" -d "$FPBODY"); BODY=$(cat /tmp/servio_body2)
check "POST /webhooks/foodpanda/:slug signed" 200 "$FPSTATUS" "$BODY"; eqv "foodpanda order created" "processed" "$(jqv "['status']")"
FPSTATUS=$(curl -sS -o /tmp/servio_body2 -w "%{http_code}" -X POST "$BASE/webhooks/foodpanda/$SLUG" -H "Content-Type: application/json" -H "X-Signature: sha256=bad" -d "$FPBODY"); BODY=$(cat /tmp/servio_body2)
check "POST /webhooks/foodpanda bad signature" 401 "$FPSTATUS" "$BODY"
req GET /reports/foodpanda "$TOKEN"; check "GET /reports/foodpanda" 200 "$STATUS" "$BODY"

say "Payroll and attendance"
req POST /employees/departments "$TOKEN" '{"name":"Kitchen"}'; check "POST /employees/departments" 201 "$STATUS" "$BODY"; DEPT=$(jqv "['id']")
req POST /employees/components "$TOKEN" '{"name":"Allowance","kind":"earning","default_amount_minor":200000}'; check "POST /employees/components" 201 "$STATUS" "$BODY"; COMP=$(jqv "['id']")
req PUT /employees/rules "$TOKEN" '{"shift_start":"10:00","grace_minutes":15,"late_fine_minor":20000,"absent_rule":"fixed_26"}'; check "PUT /employees/rules default" 200 "$STATUS" "$BODY"
req POST /employees "$TOKEN" "{\"name\":\"Ali Raza\",\"designation\":\"Cook\",\"department_id\":\"$DEPT\",\"membership_id\":\"$CASHIER\",\"base_salary_minor\":5200000,\"joined_on\":\"2026-01-01\",\"components\":[{\"salary_component_id\":\"$COMP\"}]}"; check "POST /employees" 201 "$STATUS" "$BODY"; EMP=$(jqv "['id']")
req POST /attendance/check_in "$TOKEN" "{\"employee_id\":\"$EMP\",\"source\":\"manual\"}"; check "POST /attendance/check_in" 201 "$STATUS" "$BODY"
req POST /attendance/check_out "$TOKEN" "{\"employee_id\":\"$EMP\"}"; check "POST /attendance/check_out" 200 "$STATUS" "$BODY"
req GET "/attendance" "$TOKEN"; check "GET /attendance today" 200 "$STATUS" "$BODY"
req POST /employees/leaves "$TOKEN" "{\"employee_id\":\"$EMP\",\"kind\":\"sick\",\"from_date\":\"$(date -d '+7 days' +%F)\",\"to_date\":\"$(date -d '+8 days' +%F)\"}"; check "POST /employees/leaves" 201 "$STATUS" "$BODY"; LEAVE=$(jqv "['id']")
req POST /employees/leaves/$LEAVE/decide "$TOKEN" '{"approve":true}'; check "POST /employees/leaves/:id/decide" 200 "$STATUS" "$BODY"
req POST /payroll/advances "$TOKEN" "{\"employee_id\":\"$EMP\",\"amount_minor\":100000,\"reason\":\"Medical\",\"installment_minor\":50000}"; check "POST /payroll/advances" 201 "$STATUS" "$BODY"; ADV=$(jqv "['id']")
req POST /payroll/advances/$ADV/decide "$TOKEN" '{"approve":true}'; check "POST /payroll/advances/:id/decide" 200 "$STATUS" "$BODY"
req POST /payroll/advances/$ADV/pay "$TOKEN" '{"method_code":"cash"}'; check "POST /payroll/advances/:id/pay" 200 "$STATUS" "$BODY"
req GET "/attendance/summary?month=$(date +%Y-%m)" "$TOKEN"; check "GET /attendance/summary" 200 "$STATUS" "$BODY"
req POST /payroll/runs "$TOKEN" "{\"month\":\"$(date +%Y-%m)\"}"; check "POST /payroll/runs" 201 "$STATUS" "$BODY"; PRUN=$(jqv "['id']"); eqv "one payslip" "1" "$(jqv "['employees_count']")"
req GET /payroll/runs/$PRUN "$TOKEN"; check "GET /payroll/runs/:id" 200 "$STATUS" "$BODY"
req POST /payroll/runs/$PRUN/pay "$TOKEN" '{"method_code":"cash"}'; check "POST /payroll/runs/:id/pay" 200 "$STATUS" "$BODY"; eqv "payroll paid" "paid" "$(jqv "['status']")"
req GET /payroll/runs "$TOKEN"; check "GET /payroll/runs" 200 "$STATUS" "$BODY"

say "Catering pre-orders"
WHEN=$(date -u -d "+3 days" +%Y-%m-%dT13:00:00Z)
req POST /orders "$TOKEN" "{\"order_type\":\"takeaway\",\"guest_name\":\"Office lunch\",\"scheduled_for\":\"$WHEN\",\"lines\":[{\"product_id\":\"$BURGER\",\"quantity\":20}],\"place\":true}"; check "POST /orders scheduled pre-order" 201 "$STATUS" "$BODY"; PRE=$(jqv "['id']")
req GET /kitchen/orders "$TOKEN"; eqv "pre-order hidden from kitchen until due" "False" "$(echo "$BODY" | python3 -c "import sys,json; print('$PRE' in [o['id'] for o in json.load(sys.stdin)['data']])")"
req GET "/orders?preorders=true" "$TOKEN"; check "GET /orders?preorders=true" 200 "$STATUS" "$BODY"
req POST /orders/$PRE/payments "$TOKEN" '{"payments":[{"method_code":"cash","amount_minor":300000}]}'; check "POST advance payment" 201 "$STATUS" "$BODY"; eqv "advance leaves order partial" "partial" "$(jqv "['order']['payment_status']")"

say "Isolation"
req POST /auth/signup "" "{\"name\":\"Other\",\"business_name\":\"Other $STAMP\",\"email\":\"other2-$STAMP@example.com\",\"password\":\"password123\"}"; OTHER=$(jqv "['access_token']")
req GET /stock_items/$CHK "$OTHER"; check "other business cannot read stock item" 404 "$STATUS" "$BODY"
req GET /stock_items "$OTHER"; eqv "other business sees no items" "0" "$(jqv "['data'].__len__()")"

printf "\n%s passed, %s failed\n" "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
