"use client";
import Dexie, { type Table } from "dexie";
import type { SyncRecordType } from "@/lib/types";
import type { CartLine } from "@/lib/pricing";

export interface LocalPayment { id: string; method_code: string; amount_minor: number; tendered_minor?: number; change_minor?: number; reference?: string; client_created_at: string }

/** An order as the till knows it. Server fields are a snapshot; local_only means the server has not accepted it yet. */
export interface LocalOrder {
  id: string;
  serial: number | null;
  till_serial: string | null;
  label: string;
  status: string;
  payment_status: string;
  order_type: string;
  table_id: string | null;
  table_code: string | null;
  guest_name: string | null;
  covers: number | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  is_staff_meal: boolean;
  staff_meal_reason: string | null;
  lines: CartLine[];
  subtotal_minor: number;
  discount_minor: number;
  service_charge_minor: number;
  tax_minor: number;
  rounding_minor: number;
  tip_minor: number;
  total_minor: number;
  paid_minor: number;
  payments: LocalPayment[];
  receipt_number: string | null;
  void_reason: string | null;
  membership_id: string | null;
  cashier_name: string | null;
  business_day: string;
  client_created_at: string;
  created_at: string;
  updated_at: string;
  local_only: boolean;
  /** 1 when the order is currently open on the till (draft/held/placed...). Index-friendly. */
  open: number;
  delivery_charge_minor?: number;
  address_id?: string | null;
  /** SPEC Charges and Tax: per-order charge values and the tax choice, as last known from the server or the cashier. */
  service_charge_percent?: number | null;
  service_charge_fixed_minor?: number | null;
  delivery_charge_percent?: number | null;
  tax_choice?: "none" | "rate" | null;
  tax_rate_id?: string | null;
}

export interface QueueItem {
  id: string;
  type: SyncRecordType;
  membership_id?: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  next_at: number;
  last_error: string | null;
  status: "pending" | "sending";
}

export interface AttentionItem { id: string; type: string; code: string; message: string; payload: Record<string, unknown>; created_at: string }

export interface KV { key: string; value: unknown }

export class ServioDB extends Dexie {
  kv!: Table<KV, string>;
  orders!: Table<LocalOrder, string>;
  queue!: Table<QueueItem, string>;
  attention!: Table<AttentionItem, string>;
  constructor() {
    super("servio-till");
    this.version(1).stores({
      kv: "key",
      orders: "id, status, open, business_day, updated_at, local_only",
      queue: "id, status, next_at, created_at",
      attention: "id, created_at",
    });
  }
}

export const db = new ServioDB();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try { const row = await db.kv.get(key); return row?.value as T | undefined; } catch { return undefined; }
}
export async function kvSet(key: string, value: unknown) {
  try { await db.kv.put({ key, value }); } catch {}
}
