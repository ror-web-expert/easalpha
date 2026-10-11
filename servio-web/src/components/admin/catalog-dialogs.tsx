"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, ApiError, api, errorMessage } from "@/lib/api";
import type { Menu, MenuImportPreview, MenuImportResult, MenuImportSource, ProductCode, SettingKey } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { formatMoney } from "@/lib/money";
import { useList } from "@/components/admin/crud";
import { SearchInput } from "@/components/admin/page";
import { SettingsScreenCard, useSettings } from "@/components/admin/settings-screen";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { detectImportSource, menuExportFileName } from "@/components/admin/catalog-helpers";

const MENU_KEYS = ["products", "product", "categories", "menus", "deals"];

// ---- Download Menu (GET /menu/export) ----

/** Fetches the whole menu as JSON with the admin token and saves it as servio-menu-YYYY-MM-DD.json. */
export async function downloadMenu(): Promise<void> {
  const s = useAuthStore.getState();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (s.session?.access_token) headers.Authorization = `Bearer ${s.session.access_token}`;
  if (s.branchId) headers["X-Branch-Id"] = s.branchId;
  const res = await fetch(`${API_URL}/menu/export`, { headers });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json())?.error?.message ?? msg; } catch {}
    throw new ApiError(`http_${res.status}`, msg || "Download failed", res.status);
  }
  const blob = new Blob([await res.text()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = menuExportFileName(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Display Settings (catalog.display.* keys of the Point of Sale group) ----

export const DISPLAY_SCREEN = "Display Settings";
export interface DisplaySettings { images: boolean; columns: number; show_prices: boolean; show_inactive: boolean }

export function displayKeys(groups: ReturnType<typeof useSettings>["data"]): SettingKey[] {
  const screen = groups?.groups?.point_of_sale?.screens?.[DISPLAY_SCREEN] ?? [];
  return screen.filter((k) => k.key.startsWith("catalog.display."));
}

/** The four catalog.display.* values with their defaults; the catalog list reads show_inactive from here. */
export function useDisplaySettings(): { data: DisplaySettings; isLoading: boolean } {
  const q = useSettings();
  const data = useMemo(() => {
    const keys = displayKeys(q.data);
    const val = (k: string) => { const s = keys.find((x) => x.key === k); return s ? (s.value ?? s.default) : undefined; };
    return {
      images: val("catalog.display.images") !== false,
      columns: Number(val("catalog.display.columns") ?? 4) || 4,
      show_prices: val("catalog.display.show_prices") !== false,
      show_inactive: val("catalog.display.show_inactive") === true,
    };
  }, [q.data]);
  return { data, isLoading: q.isLoading };
}

export function DisplaySettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const keys = displayKeys(settings.data);
  return (
    <Dialog open={open} onClose={onClose} title="Display Settings" description="How the catalog shows on the till and in this list." size="md">
      {settings.isLoading ? <Loading /> : keys.length ? <SettingsScreenCard screen={DISPLAY_SCREEN} keys={keys} className="mb-4" /> : <p className="py-6 text-sm text-fg-muted">No display settings are available for this account.</p>}
    </Dialog>
  );
}

// ---- Product Codes (SKU and PCT code for every product) ----

export function ProductCodesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["product_codes"], queryFn: () => api<{ data: ProductCode[] }>("/products/codes"), enabled: open, select: (r) => r.data });
  const [edits, setEdits] = useState<Record<string, { sku: string; pct_code: string }>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setEdits({}); setQ(""); } }, [open]);
  const rows = (list.data ?? []).filter((r) => !q || `${r.name} ${r.category} ${r.sku ?? ""} ${r.pct_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const valueOf = (r: ProductCode) => edits[r.id] ?? { sku: r.sku ?? "", pct_code: r.pct_code ?? "" };
  const changed = (list.data ?? []).filter((r) => { const e = edits[r.id]; return e && (e.sku !== (r.sku ?? "") || e.pct_code !== (r.pct_code ?? "")); });
  const save = async () => {
    setBusy(true);
    try {
      await api("/products/codes", { method: "PUT", body: { rows: changed.map((r) => ({ id: r.id, sku: edits[r.id].sku.trim() || null, pct_code: edits[r.id].pct_code.trim() || null })) } });
      MENU_KEYS.concat("product_codes").forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setEdits({});
      toast.success(`${changed.length} product${changed.length === 1 ? "" : "s"} updated`);
      onClose();
    } catch (e) { toast.error("Could not save", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Product Codes" description="SKU for your own tracking and the PCT code the PRA e-IMS tax report needs." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!changed.length}>Save {changed.length ? `(${changed.length})` : ""}</Button></>}>
      <div className="mb-3"><SearchInput value={q} onChange={setQ} placeholder="Product, category, SKU or PCT code" /></div>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Product</TH><TH>Category</TH><TH>SKU</TH><TH>PCT code</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => {
              const v = valueOf(r);
              return (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-fg-secondary">{r.category}</TD>
                  <TD className="w-40"><Input className="h-8 font-mono text-xs" value={v.sku} onChange={(e) => setEdits({ ...edits, [r.id]: { ...v, sku: e.target.value } })} /></TD>
                  <TD className="w-40"><Input className="h-8 font-mono text-xs" value={v.pct_code} onChange={(e) => setEdits({ ...edits, [r.id]: { ...v, pct_code: e.target.value } })} /></TD>
                </TR>
              );
            }) : <EmptyRow colSpan={4}>No products match.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </Dialog>
  );
}

// ---- Import JSON (POST /menu/import/preview then /menu/import/apply) ----

const SOURCE_LABELS: Record<MenuImportSource, string> = { servio_json: "EasAlpha export", arfapos_json: "ArfaPOS JSON", csv: "CSV" };

export function ImportMenuDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const menus = useList<Menu>("menus", "/menus", {}, open);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceOverride, setSourceOverride] = useState<MenuImportSource | "">("");
  const [menuId, setMenuId] = useState("");
  const [preview, setPreview] = useState<MenuImportPreview | null>(null);
  const [result, setResult] = useState<MenuImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const detected = useMemo(() => detectImportSource(text), [text]);
  const source: MenuImportSource = sourceOverride || detected;
  useEffect(() => { if (!open) { setText(""); setFileName(null); setSourceOverride(""); setPreview(null); setResult(null); setMenuId(""); } }, [open]);
  const onFile = (f: File | undefined) => { if (!f) return; setFileName(f.name); f.text().then((t) => { setText(t); setPreview(null); setResult(null); }); };
  const runPreview = async () => {
    setBusy("preview");
    try {
      // The API parses the string itself (JSON or CSV), so the raw text goes through untouched.
      const p = await api<MenuImportPreview>("/menu/import/preview", { method: "POST", body: { source, data: text } });
      setPreview(p);
      setResult(null);
    } catch (e) { toast.error("Could not read the file", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const apply = async () => {
    if (!preview) return;
    setBusy("apply");
    try {
      const r = await api<MenuImportResult>("/menu/import/apply", { method: "POST", body: { import_job_id: preview.import_job_id, menu_id: menuId || undefined } });
      setResult(r);
      MENU_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Menu imported", `${r.created} created, ${r.updated} updated, ${r.skipped} skipped`);
    } catch (e) { toast.error("Import failed", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const shown = preview?.rows.slice(0, 200) ?? [];
  return (
    <Dialog open={open} onClose={onClose} title="Import JSON" description="Load a menu in bulk from a EasAlpha export, an ArfaPOS JSON export or a CSV. Preview first, then apply." size="xl"
      footer={result ? <Button onClick={onClose}>Done</Button> : <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {preview ? <Button onClick={apply} loading={busy === "apply"} disabled={!preview.valid_count}>Apply {preview.valid_count} row{preview.valid_count === 1 ? "" : "s"}</Button>
          : <Button onClick={runPreview} loading={busy === "preview"} disabled={!text.trim()}>Preview</Button>}
      </>}>
      {result ? (
        <div className="space-y-2 py-4 text-sm">
          <p>Created <b>{result.created}</b>, updated <b>{result.updated}</b>, skipped <b>{result.skipped}</b>.</p>
          <p className="text-fg-muted">The products are now in the catalog. Set images, variants and recipes on each product form.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
            {fileName ? <span className="text-xs text-fg-muted">{fileName}</span> : null}
            <span className="ml-auto flex items-center gap-2 text-xs text-fg-secondary">
              Detected: <Badge variant="info">{SOURCE_LABELS[detected]}</Badge>
              <Select className="h-8 w-auto text-xs" value={sourceOverride} onChange={(e) => { setSourceOverride(e.target.value as MenuImportSource | ""); setPreview(null); }}>
                <option value="">Use detected</option>
                {(Object.keys(SOURCE_LABELS) as MenuImportSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
              </Select>
            </span>
          </div>
          <Field label="Or paste the file contents"><Textarea className="min-h-40 font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder='{"menus": [{"categories": [{"name": "Burgers", "products": [{"name": "Zinger", "price": 450}]}]}]}' /></Field>
          <Field label="Import into menu" hint="Categories that do not exist yet are created inside this menu.">
            <Select value={menuId} onChange={(e) => setMenuId(e.target.value)}><option value="">Default menu</option>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </Field>
          {preview ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="success">{preview.valid_count} ready</Badge>
                {preview.error_rows.length ? <Badge variant="danger">{preview.error_rows.length} with errors</Badge> : null}
                <span className="text-fg-muted">{preview.categories.length} categor{preview.categories.length === 1 ? "y" : "ies"}: {preview.categories.join(", ") || "-"}</span>
              </div>
              {preview.parse_errors.length ? <ul className="text-sm text-danger">{preview.parse_errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
              <Table>
                <THead><tr><TH>#</TH><TH>Category</TH><TH>Name</TH><TH>SKU</TH><TH right>Price</TH><TH>Problem</TH></tr></THead>
                <TBody>
                  {shown.length ? shown.map((r) => (
                    <TR key={r.line} className={r.error ? "bg-danger-soft/40" : undefined}>
                      <TD className="text-fg-muted">{r.line}</TD>
                      <TD>{r.category ?? <span className="text-fg-muted">-</span>}</TD>
                      <TD className="font-medium">{r.name ?? <span className="text-fg-muted">-</span>}{r.name_ur ? <span className="ml-2 text-fg-muted">{r.name_ur}</span> : null}</TD>
                      <TD className="font-mono text-xs text-fg-secondary">{r.sku ?? "-"}</TD>
                      <TD right>{r.price_minor === null ? "-" : formatMoney(r.price_minor)}</TD>
                      <TD className="text-danger">{r.error ?? ""}</TD>
                    </TR>
                  )) : <EmptyRow colSpan={6}>No products found in this file.</EmptyRow>}
                </TBody>
              </Table>
              {preview.row_count > shown.length ? <p className="text-xs text-fg-muted">Showing the first {shown.length} of {preview.row_count} rows.</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
