"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronLeft, ChevronRight, Download, Sparkles, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useDebounced, usePagedList } from "@/lib/hooks";
import { packQuantity } from "@/lib/barcode";
import { formatMoney } from "@/lib/money";
import type { Category, Product, ProductBarcode } from "@/lib/types";
import { useAuthStore, useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import {
  LABEL_PRESETS, clampSkip, downloadLabelsPdf, drawingSvg, expandCopies, labelDrawing, labelsPerPage, layoutLabels, loadSymbols, pageCount, presetById, slotPosition, svgDataUrl,
  type CodeSymbol, type Drawing, type LabelData, type LabelOptions,
} from "@/components/admin/barcode-labels";
import { Button, Card, CardBody, CardHeader, CardTitle, Checkbox, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

/** A product picked for printing: which of its codes, and how many labels. */
interface Pick { product: Product; code: string; copies: number }

const EMPTY: Drawing = { rects: [], texts: [] };

function codeLabel(p: Product, b: ProductBarcode): string {
  const size = b.variant_id ? p.variants?.find((v) => v.id === b.variant_id)?.name : null;
  const pack = packQuantity(b);
  return [b.code, size ?? (p.variants?.length ? "any size" : null), pack !== 1 ? `pack of ${pack}` : null].filter(Boolean).join(" · ");
}

/** Price printed on the label: the size's price (or the base price) times the pack quantity. */
function labelPrice(p: Product, code: string): number {
  const b = p.barcodes?.find((x) => x.code === code);
  const v = b?.variant_id ? p.variants?.find((x) => x.id === b.variant_id) : null;
  return Math.round((v?.price_minor ?? p.base_price_minor) * (b ? packQuantity(b) : 1));
}

function labelName(p: Product, code: string): string {
  const b = p.barcodes?.find((x) => x.code === code);
  const v = b?.variant_id ? p.variants?.find((x) => x.id === b.variant_id) : null;
  return v ? `${p.name} (${v.name})` : p.name;
}

export default function BarcodeLabelsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const canEdit = can("menu.edit");
  const business = useAuthStore((s) => s.session?.business);
  const currency = business?.currency;
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cat, setCat] = useState("");
  const cats = useList<Category>("categories", "/categories");
  const list = usePagedList<Product>(["products", "labels"], "/products", { q: dq, category_id: cat, limit: 100 });
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [presetId, setPresetId] = useState<string>(LABEL_PRESETS[0].id);
  const [opts, setOpts] = useState<LabelOptions>({ showName: true, showPrice: true, showBusiness: false, qr: false });
  const [startAt, setStartAt] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [symbols, setSymbols] = useState<Map<string, CodeSymbol>>(new Map());
  const preset = presetById(presetId);
  const skip = clampSkip(preset, startAt - 1);

  const rows = list.rows;
  const picked = useMemo(() => Object.values(picks), [picks]);
  const printable = useMemo(() => picked.filter((p) => p.code && p.copies > 0), [picked]);
  const withoutCode = picked.filter((p) => !p.code).map((p) => p.product);

  const toggle = (p: Product, on: boolean) => setPicks((cur) => {
    const next = { ...cur };
    if (on) next[p.id] = cur[p.id] ?? { product: p, code: p.barcodes?.[0]?.code ?? "", copies: 1 };
    else delete next[p.id];
    return next;
  });
  const update = (p: Product, patch: Partial<Pick>) => setPicks((cur) => ({ ...cur, [p.id]: { ...(cur[p.id] ?? { product: p, code: p.barcodes?.[0]?.code ?? "", copies: 1 }), ...patch } }));

  /** New in-store codes (prefix 20) for products without one, saved on each product, then picked for printing. */
  const giveCodes = async (products: Product[]) => {
    if (!products.length) return;
    setGenerating(true);
    let saved = 0;
    try {
      const r = await api<{ codes: string[] }>("/products/barcodes/generate", { method: "POST", body: { count: products.length } });
      for (const [i, p] of products.entries()) {
        const code = r.codes[i];
        if (!code) break;
        const res = await api<{ barcode: ProductBarcode; product: Product }>(`/products/${p.id}/barcodes`, { method: "POST", body: { code } });
        setPicks((cur) => ({ ...cur, [p.id]: { product: res.product, code, copies: cur[p.id]?.copies ?? 1 } }));
        saved += 1;
      }
      toast.success(saved === 1 ? "Code saved" : `${saved} codes saved`, "In-store codes start with 20 and now scan on the POS.");
    } catch (e) {
      toast.error(saved ? `${saved} saved, then it stopped` : "Could not save the code", errorMessage(e));
    } finally {
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    }
  };

  // One LabelData per picked row, repeated for its copies (the same object, so each label is laid out once).
  const items = useMemo(() => expandCopies(printable.map((p) => ({
    item: { code: p.code, name: labelName(p.product, p.code), price: formatMoney(labelPrice(p.product, p.code), currency), business: business?.name ?? "" } as LabelData,
    copies: p.copies,
  }))), [printable, currency, business?.name]);
  const codesKey = [...new Set(items.map((i) => i.code))].sort().join("|");
  useEffect(() => {
    if (!codesKey) { setSymbols(new Map()); return; }
    let live = true;
    loadSymbols(codesKey.split("|"), opts.qr).then((m) => { if (live) setSymbols(m); }).catch((e) => toast.error("Could not draw the codes", errorMessage(e)));
    return () => { live = false; };
  }, [codesKey, opts.qr]);

  const pages = useMemo(() => layoutLabels(items, preset, skip), [items, preset, skip]);
  const shown = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const preview = useMemo(() => {
    const page = pages[shown];
    if (!page) return null;
    const drawings = new Map<LabelData, Drawing>();
    const filled = new Set(page.map((s) => s.slot));
    // Empty slots of a sheet are outlined too, so the preview looks like the sheet.
    const empty = Array.from({ length: labelsPerPage(preset) }, (_, slot) => slot).filter((slot) => !filled.has(slot))
      .map((slot) => ({ ...slotPosition(preset, slot), drawing: EMPTY }));
    const parts = [
      ...empty.map((e) => ({ dx: e.x, dy: e.y, drawing: e.drawing, outline: { w: preset.labelWidth, h: preset.labelHeight } })),
      ...page.map((spot) => {
        const symbol = symbols.get(spot.item.code);
        let d = drawings.get(spot.item);
        if (!d && symbol) { d = labelDrawing(spot.item, symbol, spot.w, spot.h, opts); drawings.set(spot.item, d); }
        return { dx: spot.x, dy: spot.y, drawing: d ?? EMPTY, outline: { w: spot.w, h: spot.h } };
      }),
    ];
    return svgDataUrl(drawingSvg(preset.pageWidth, preset.pageHeight, parts));
  }, [pages, shown, preset, symbols, opts]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadLabelsPdf(items, preset, opts, skip, `barcode-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) { toast.error("Could not make the PDF", errorMessage(e)); }
    finally { setDownloading(false); }
  };

  const allShown = rows.length > 0 && rows.every((p) => picks[p.id]);
  const sheets = pageCount(items.length, preset, skip);
  return (
    <>
      <PageHeader icon={Barcode} title="Barcode Labels" description="Print barcode or QR labels for packaged items: pick products, choose the code and how many labels, then download a PDF for an A4 label sheet or a roll printer."
        actions={<Button onClick={download} loading={downloading} disabled={!items.length}><Download className="h-4 w-4" /> Download PDF</Button>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <FilterBar>
            <SearchInput value={q} onChange={setQ} placeholder="Name, SKU or barcode" />
            <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            {picked.length ? <Button variant="ghost" size="sm" onClick={() => setPicks({})}><X className="h-4 w-4" /> Clear {picked.length} picked</Button> : null}
          </FilterBar>
          {list.isLoading ? <Loading /> : (
            <Table compact>
              <THead><tr>
                <TH className="w-10"><Checkbox aria-label="Pick all shown" checked={allShown} onChange={(e) => rows.forEach((p) => toggle(p, e.target.checked))} /></TH>
                <TH>Product</TH><TH>Code</TH><TH right>Price</TH><TH className="w-24">Labels</TH>
              </tr></THead>
              <TBody>
                {rows.length ? rows.map((p) => {
                  const pick = picks[p.id];
                  const product = pick?.product ?? p;
                  const codes = product.barcodes ?? [];
                  const code = pick?.code ?? codes[0]?.code ?? "";
                  return (
                    <TR key={p.id}>
                      <TD><Checkbox aria-label={`Pick ${p.name}`} checked={!!pick} onChange={(e) => toggle(product, e.target.checked)} /></TD>
                      <TD className="font-medium">{p.name}{p.active ? null : <span className="ml-2 text-xs text-fg-muted">inactive</span>}</TD>
                      <TD className="min-w-48">
                        {codes.length ? (
                          <Select className="h-8 font-mono text-xs" value={code} onChange={(e) => update(product, { code: e.target.value })} aria-label={`Code for ${p.name}`}>
                            {codes.map((b) => <option key={b.code} value={b.code}>{codeLabel(product, b)}</option>)}
                          </Select>
                        ) : canEdit ? (
                          <Button size="sm" variant="soft" onClick={() => giveCodes([product])} disabled={generating}><Sparkles className="h-4 w-4" /> Generate code</Button>
                        ) : <span className="text-xs text-fg-muted">No code</span>}
                      </TD>
                      <TD right>{formatMoney(labelPrice(product, code), currency)}</TD>
                      <TD><Input type="number" min={0} max={999} className="h-8 w-20 tabular" aria-label={`Labels for ${p.name}`} value={pick ? pick.copies : ""} placeholder="0"
                        onChange={(e) => { const n = Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))); if (n || pick) update(product, { copies: n }); }} /></TD>
                    </TR>
                  );
                }) : <EmptyRow colSpan={5}>No products match.</EmptyRow>}
              </TBody>
            </Table>
          )}
          <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Layout</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <Field label="Labels"><Select value={presetId} onChange={(e) => { setPresetId(e.target.value); setPageIndex(0); }}>{LABEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              {preset.sheet ? (
                <Field label="Start at label" hint={`Skip labels already used on a part-used sheet (1 to ${labelsPerPage(preset)}).`}>
                  <Input type="number" min={1} max={labelsPerPage(preset)} className="w-24 tabular" value={startAt} onChange={(e) => setStartAt(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Checkbox label="Product name" checked={opts.showName} onChange={(e) => setOpts({ ...opts, showName: e.target.checked })} />
                <Checkbox label="Price" checked={opts.showPrice} onChange={(e) => setOpts({ ...opts, showPrice: e.target.checked })} />
                <Checkbox label="Business name" checked={opts.showBusiness} onChange={(e) => setOpts({ ...opts, showBusiness: e.target.checked })} />
                <Checkbox label="QR code instead of barcode" checked={opts.qr} onChange={(e) => setOpts({ ...opts, qr: e.target.checked })} />
              </div>
              <p className="text-sm">
                <b className="tabular">{printable.length}</b> product{printable.length === 1 ? "" : "s"}, <b className="tabular">{items.length}</b> label{items.length === 1 ? "" : "s"}
                {items.length ? <>, <b className="tabular">{sheets}</b> {preset.sheet ? (sheets === 1 ? "sheet" : "sheets") : (sheets === 1 ? "page" : "pages")}</> : null}
              </p>
              {withoutCode.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                  <span>{withoutCode.length} picked product{withoutCode.length === 1 ? " has" : "s have"} no code yet.</span>
                  {canEdit ? <Button size="sm" variant="secondary" onClick={() => giveCodes(withoutCode)} loading={generating}><Sparkles className="h-4 w-4" /> Generate and save codes</Button> : null}
                </div>
              ) : null}
              <p className="text-xs text-fg-muted">Print at actual size (100%, no scaling). Codes print as EAN-13, UPC-A, EAN-8 or Code 128 to match the code; long codes and links print as QR.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              {pages.length > 1 ? (
                <div className="flex items-center gap-1 text-sm">
                  <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(Math.max(0, shown - 1))} disabled={shown === 0} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="tabular">{shown + 1} / {pages.length}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setPageIndex(Math.min(pages.length - 1, shown + 1))} disabled={shown >= pages.length - 1} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              ) : null}
            </CardHeader>
            <CardBody>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={`Label page ${shown + 1}`} className={preset.sheet ? "mx-auto w-full max-w-sm rounded-sm border" : "mx-auto w-full max-w-xs rounded-sm border"} />
              ) : <p className="py-8 text-center text-sm text-fg-muted">Pick products with a code to see the labels.</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
