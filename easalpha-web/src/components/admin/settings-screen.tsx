"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { SettingKey, SettingsResponse } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Field, Input, Label, Loading, Select, Switch, Textarea } from "@/components/ui";

// SPEC "Settings and multi-outlet": every key in the typed settings store is rendered by type, grouped by screen,
// so a new key on the API shows up here without a screen change. Secrets (pins, tokens) never round-trip: the API
// returns "set" or null and a blank field on save leaves the stored value alone.

export type Control = "switch" | "number" | "text" | "select" | "json" | "checkbox-set" | "pin" | "secret";
export interface ControlSpec { control: Control; options?: { value: string; label: string }[] }

const ORDER_TYPES = [
  { value: "dine_in", label: "Dine-in" }, { value: "takeaway", label: "Takeaway" }, { value: "delivery", label: "Delivery" }, { value: "walk_in", label: "Walk-in" },
];
const CUSTOMER_FIELDS = [
  { value: "name", label: "Name" }, { value: "phone", label: "Phone" }, { value: "email", label: "Email" }, { value: "address", label: "Address" },
];
const SELECT_OPTIONS: [suffix: string, options: ControlSpec["options"]][] = [
  [".language", [{ value: "en", label: "English" }, { value: "ur", label: "Urdu" }]],
  [".mode", [{ value: "percent", label: "Percent" }, { value: "fixed", label: "Fixed amount" }]],
  [".environment", [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }]],
  [".paper", [{ value: "80", label: "80 mm (48 chars)" }, { value: "58", label: "58 mm (32 chars)" }]],
  [".default_payment_method", [
    { value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "easypaisa", label: "Easypaisa" }, { value: "jazzcash", label: "JazzCash" }, { value: "bank", label: "Bank transfer" }, { value: "khata", label: "Khata (credit)" },
  ]],
  ["default_order_type", ORDER_TYPES],
  [".terminator", [{ value: "enter", label: "Enter (most scanners)" }, { value: "tab", label: "Tab" }, { value: "none", label: "Nothing (timing only)" }]],
  [".unknown_code", [{ value: "ask", label: "Offer to attach it to a product" }, { value: "ignore", label: "Only show Not found" }]],
  [".scale_value", [{ value: "weight", label: "Weight" }, { value: "price", label: "Price" }]],
  [".tile_size", [{ value: "small", label: "Small: more items on the screen" }, { value: "large", label: "Large: a big picture of each item" }]],
];
/** String keys whose value is a secret the API masks as "set"; shown as a password field like a pin, any length. */
const SECRET_SUFFIXES = [".access_code", ".bearer_token", ".token"];

/** Which control a key gets. Pure, so screens stay predictable and the mapping can be tested. */
export function controlFor(key: Pick<SettingKey, "key" | "type">): ControlSpec {
  if (key.type === "boolean") return { control: "switch" };
  if (key.type === "integer" || key.type === "number") return { control: "number" };
  if (key.type === "pin") return { control: "pin" };
  if (key.type === "json") {
    if (key.key === "pos.customer_fields") return { control: "checkbox-set", options: CUSTOMER_FIELDS };
    if (key.key.endsWith(".order_types")) return { control: "checkbox-set", options: ORDER_TYPES };
    return { control: "json" };
  }
  const match = SELECT_OPTIONS.find(([suffix]) => key.key.endsWith(suffix));
  if (match) return { control: "select", options: match[1] };
  if (SECRET_SUFFIXES.some((s) => key.key.endsWith(s))) return { control: "secret" };
  return { control: "text" };
}

/** Server value -> what the control edits. Pins and secrets start blank; json becomes text; numbers stay number|null. */
export function editValue(key: SettingKey): unknown {
  const c = controlFor(key).control;
  if (c === "pin" || c === "secret") return "";
  if (c === "json") return key.value === null || key.value === undefined ? "" : JSON.stringify(key.value, null, 2);
  if (c === "checkbox-set") return Array.isArray(key.value) ? key.value : [];
  if (c === "switch") return key.value === true;
  if (c === "number") return typeof key.value === "number" ? key.value : key.value === null || key.value === undefined || key.value === "" ? null : Number(key.value);
  return key.value === null || key.value === undefined ? "" : String(key.value);
}

/** Edited control value -> what PATCH /settings receives. Throws on invalid JSON so the card can show the error. */
export function payloadValue(key: SettingKey, edited: unknown): unknown {
  const c = controlFor(key).control;
  if (c === "json") {
    const text = String(edited ?? "").trim();
    return text === "" ? null : JSON.parse(text);
  }
  if (c === "text" || c === "select") return edited === "" ? null : edited;
  return edited;
}

/** Keys whose edited value differs from the original. Blank pins and secrets are never a change, so saving a card
 *  with an untouched PIN field leaves the stored PIN alone. */
export function changedValues(original: Record<string, unknown>, edited: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edited)) {
    if (JSON.stringify(v) !== JSON.stringify(original[k])) out[k] = v;
  }
  return out;
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsResponse>("/settings") });
}

function initial(keys: SettingKey[]) {
  return Object.fromEntries(keys.map((k) => [k.key, editValue(k)]));
}

/** One screen: a card of controls with its own Save that PATCHes only the changed keys. */
export function SettingsScreenCard({ screen, keys, className }: { screen: string; keys: SettingKey[]; className?: string }) {
  const original = useMemo(() => initial(keys), [keys]);
  const [edited, setEdited] = useState<Record<string, unknown>>(original);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  // Re-seed only when the server values for this card change (after our own save, or another admin's), so
  // unsaved edits in other cards are not thrown away by a refetch.
  const signature = JSON.stringify(original);
  useEffect(() => { setEdited(original); setJsonErrors({}); }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction<Record<string, unknown>, { version: number }>(["settings"], (values) => api("/settings", { method: "PATCH", body: { values } }), "Settings saved");
  const changes = changedValues(original, edited);
  const dirty = Object.keys(changes).length > 0;
  const set = (k: string, v: unknown) => setEdited((e) => ({ ...e, [k]: v }));
  const onSave = () => {
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const k of keys) {
      if (!(k.key in changes)) continue;
      try { values[k.key] = payloadValue(k, changes[k.key]); } catch { errors[k.key] = "Not valid JSON"; }
    }
    setJsonErrors(errors);
    if (Object.keys(errors).length) return;
    save.mutate(values);
  };
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{screen}</CardTitle>
        <Button size="sm" onClick={onSave} loading={save.isPending} disabled={!dirty}>Save</Button>
      </CardHeader>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {keys.map((k) => <SettingControl key={k.key} setting={k} value={edited[k.key]} onChange={(v) => set(k.key, v)} error={jsonErrors[k.key]} />)}
      </CardBody>
    </Card>
  );
}

function KeyName({ k }: { k: string }) {
  return <p className="mt-1 font-mono text-[11px] text-fg-muted">{k}</p>;
}

function SettingControl({ setting, value, onChange, error }: { setting: SettingKey; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const spec = controlFor(setting);
  const wide = spec.control === "json" || spec.control === "checkbox-set" ? "sm:col-span-2" : undefined;
  switch (spec.control) {
    case "switch":
      return (
        <div className={wide}>
          <Switch checked={value === true} onChange={onChange} label={setting.label} />
          <KeyName k={setting.key} />
        </div>
      );
    case "number":
      return (
        <div>
          <Field label={setting.label}>
            <Input type="number" step={setting.type === "number" ? "any" : 1} value={value === null || value === undefined ? "" : String(value)}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          <KeyName k={setting.key} />
        </div>
      );
    case "select":
      return (
        <div>
          <Field label={setting.label}>
            <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
              {spec.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <KeyName k={setting.key} />
        </div>
      );
    case "checkbox-set": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={wide}>
          <Label>{setting.label}</Label>
          <div className="flex flex-wrap gap-3">
            {spec.options?.map((o) => (
              <Checkbox key={o.value} label={o.label} checked={list.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))} />
            ))}
          </div>
          <KeyName k={setting.key} />
        </div>
      );
    }
    case "json":
      return (
        <div className={wide}>
          <Field label={setting.label} error={error}>
            <Textarea className="font-mono text-sm" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
          </Field>
          <KeyName k={setting.key} />
        </div>
      );
    case "pin":
    case "secret": {
      const isSet = setting.value === "set";
      const pin = spec.control === "pin";
      return (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Label className="mb-0">{setting.label}</Label>
            {isSet ? <Badge variant="success">set</Badge> : <Badge>not set</Badge>}
          </div>
          <Input type="password" autoComplete="new-password" inputMode={pin ? "numeric" : undefined} maxLength={pin ? 4 : undefined} pattern={pin ? "[0-9]{4}" : undefined}
            placeholder={pin ? "4 digits" : "Enter a new value"} value={String(value ?? "")} onChange={(e) => onChange(pin ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value)} />
          <p className="mt-1 text-xs text-fg-muted">{pin ? "Enter a new 4-digit PIN to replace it. " : "Enter a new value to replace it. "}Leaving this blank and saving keeps the current one.</p>
          <KeyName k={setting.key} />
        </div>
      );
    }
    default:
      return (
        <div>
          <Field label={setting.label}>
            <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
          </Field>
          <KeyName k={setting.key} />
        </div>
      );
  }
}

export function SettingsVersion({ version }: { version: number | undefined }) {
  if (version === undefined) return null;
  return <p className="-mt-4 mb-6 text-xs text-fg-muted">Settings version {version} · tills re-sync when it changes</p>;
}

/** All screens of one SPEC settings group, one card per screen. */
export function SettingsGroupPage({ group, title, description, icon, before, after }: { group: string; title: string; description?: string; icon?: LucideIcon; before?: React.ReactNode; after?: React.ReactNode }) {
  const q = useSettings();
  const g = q.data?.groups[group];
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} />
      <SettingsVersion version={q.data?.version} />
      {q.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {before}
          {g ? Object.entries(g.screens).map(([screen, keys]) => <SettingsScreenCard key={screen} screen={screen} keys={keys} />) : null}
          {after}
        </div>
      )}
    </>
  );
}
