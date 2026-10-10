"use client";
// SPEC Orders Management rows: serial, code, type, status, customer, rider, time, payment method and status, total.
// Shared by Orders Management and Pending Orders; a row click opens the order drawer.
import type { OrderSummary, Rider } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Badge, EmptyRow, Table, TBody, TD, TH, THead, TR, orderTypeVariant } from "@/components/ui";
import { orderCode, paymentMethods, sourceLabel, specPaymentVariant, specStatusVariant } from "./order-helpers";

export function customerLabel(o: OrderSummary): string {
  if (o.table_code) return `Table ${o.table_code}`;
  if (o.guest_name) return o.guest_name;
  return o.customer_id ? "Customer" : "Walk-in";
}

export function OrderTable({ rows, onSelect, riders, empty = "No orders match these filters" }: { rows: OrderSummary[]; onSelect: (id: string) => void; riders?: Rider[]; empty?: string }) {
  const riderName = (id: string | null) => (id ? riders?.find((r) => r.id === id)?.name ?? "Rider" : "-");
  return (
    <Table>
      <THead><tr><TH>Serial</TH><TH>Code</TH><TH>Type</TH><TH>Status</TH><TH>Customer</TH><TH>Rider</TH><TH>Time</TH><TH>Payment</TH><TH right>Total</TH></tr></THead>
      <TBody>
        {rows.length ? rows.map((o) => (
          <TR key={o.id} onClick={() => onSelect(o.id)}>
            <TD className="font-mono font-medium">
              {o.label}
              {o.is_staff_meal ? <Badge className="ml-1" variant="accent">comp</Badge> : null}
              {o.reopen_count ? <Badge className="ml-1" variant="outline" title={`Reopened ${o.reopen_count} times`}>R{o.reopen_count}</Badge> : null}
            </TD>
            <TD className="font-mono text-fg-secondary">{orderCode(o) || "-"}</TD>
            <TD>
              <Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge>
              <div className="mt-0.5 text-xs text-fg-muted">{sourceLabel(o.source)}</div>
            </TD>
            <TD><Badge variant={specStatusVariant(o.spec_status)}>{titleCase(o.spec_status)}</Badge></TD>
            <TD className="text-fg-secondary">{customerLabel(o)}</TD>
            <TD className="text-fg-secondary">{riderName(o.rider_id)}</TD>
            <TD className="text-fg-secondary whitespace-nowrap">{formatDateTime(o.placed_at ?? o.created_at)}</TD>
            <TD>
              <Badge variant={specPaymentVariant(o.spec_payment_status)}>{titleCase(o.spec_payment_status)}</Badge>
              {o.payment_method_summary ? <div className="mt-0.5 text-xs text-fg-muted">{paymentMethods(o.payment_method_summary)}</div> : null}
            </TD>
            <TD right className="font-medium">
              {formatMoney(o.total_minor)}
              {o.due_minor > 0 ? <div className="text-xs text-danger">Due {formatMoney(o.due_minor)}</div> : null}
            </TD>
          </TR>
        )) : <EmptyRow colSpan={9}>{empty}</EmptyRow>}
      </TBody>
    </Table>
  );
}
