"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Package, Plus, Trash2, Zap } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Page, Product, QuickAddItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { useDebounced } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { PageHeader, SearchInput } from "@/components/admin/page";
import { DragHandle, SortableList } from "@/components/admin/catalog-sortable";
import { moveItem } from "@/components/admin/catalog-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Loading } from "@/components/ui";
import { cn } from "@/lib/utils";

/** One pickable row on the left: a product, or one of its variants. */
interface Pick { key: string; product_id: string; variant_id: string | null; name: string; variant_name: string | null; price_minor: number; image_key: string | null; active: boolean }
/** One pinned row on the right. */
interface Pinned { key: string; product_id: string; variant_id: string | null; name: string; variant_name: string | null; price_minor: number; image_key: string | null; active: boolean }

const keyOf = (product_id: string, variant_id: string | null) => `${product_id}:${variant_id ?? ""}`;

function expand(products: Product[]): Pick[] {
  return products.flatMap((p): Pick[] => {
    const base = { product_id: p.id, name: p.name, image_key: p.image_key, active: p.active };
    if (p.variants?.length) return p.variants.map((v): Pick => ({ ...base, key: keyOf(p.id, v.id), variant_id: v.id, variant_name: v.name, price_minor: v.price_minor }));
    return [{ ...base, key: keyOf(p.id, null), variant_id: null, variant_name: null, price_minor: p.base_price_minor }];
  });
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : <Package className="h-4 w-4 text-fg-muted" />}
    </span>
  );
}

export default function QuickAddPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const products = useQuery({ queryKey: ["products", "quick_add_pick", dq], queryFn: () => api<Page<Product>>("/products", { query: { q: dq, limit: 200 } }), select: (r) => r.data });
  const saved = useQuery({ queryKey: ["quick_add_items"], queryFn: () => api<{ data: QuickAddItem[] }>("/quick_add_items"), select: (r) => r.data });
  const [pinned, setPinned] = useState<Pinned[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (saved.data && pinned === null) setPinned(saved.data.map((i) => ({ key: keyOf(i.product_id, i.variant_id), product_id: i.product_id, variant_id: i.variant_id, name: i.name, variant_name: i.variant_name, price_minor: i.price_minor, image_key: i.image_key, active: i.active })));
  }, [saved.data, pinned]);
  const picks = useMemo(() => expand(products.data ?? []), [products.data]);
  const pinnedKeys = useMemo(() => new Set((pinned ?? []).map((p) => p.key)), [pinned]);
  const dirty = useMemo(() => JSON.stringify((pinned ?? []).map((p) => [p.product_id, p.variant_id])) !== JSON.stringify((saved.data ?? []).map((p) => [p.product_id, p.variant_id])), [pinned, saved.data]);
  const add = (p: Pick) => { if (!pinnedKeys.has(p.key)) setPinned([...(pinned ?? []), { ...p }]); };
  const removeAt = (key: string) => setPinned((pinned ?? []).filter((p) => p.key !== key));
  const move = (i: number, dir: -1 | 1) => setPinned(moveItem(pinned ?? [], i, i + dir));
  const save = async () => {
    setBusy(true);
    try {
      await api("/quick_add_items", { method: "PUT", body: { items: (pinned ?? []).map((p) => ({ product_id: p.product_id, variant_id: p.variant_id ?? undefined })) } });
      qc.invalidateQueries({ queryKey: ["quick_add_items"] });
      setPinned(null);
      toast.success("Quick Add Menu saved");
    } catch (e) { toast.error("Could not save", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={Zap} title="Quick Add Menu" description="A short pinned list of fast movers staff fire onto a running order in one tap." actions={<>
        {dirty ? <Button variant="ghost" onClick={() => setPinned(null)} disabled={busy}>Discard changes</Button> : null}
        <Button onClick={save} loading={busy} disabled={!dirty || busy}>Save</Button>
      </>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>All products</CardTitle><SearchInput value={q} onChange={setQ} placeholder="Roti, water, drinks…" className="sm:w-60" /></CardHeader>
          <CardBody className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
            {products.isLoading ? <Loading /> : picks.length ? picks.map((p) => {
              const pinnedAlready = pinnedKeys.has(p.key);
              return (
                <button key={p.key} type="button" onClick={() => add(p)} disabled={pinnedAlready} className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-fg/[0.04] disabled:opacity-50", pinnedAlready && "hover:bg-transparent")}>
                  <Thumb src={p.image_key} />
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium">{p.name}</span>{p.variant_name ? <span className="ml-2 text-fg-secondary">{p.variant_name}</span> : null}{!p.active ? <Badge className="ml-2">inactive</Badge> : null}</span>
                  <span className="shrink-0 text-xs text-fg-muted tabular">{formatMoney(p.price_minor)}</span>
                  {pinnedAlready ? <Badge variant="primary">pinned</Badge> : <Plus className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            }) : <p className="px-2 py-6 text-center text-sm text-fg-muted">No products match.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pinned list <span className="ml-1 text-sm font-normal text-fg-muted">{pinned?.length ?? 0}</span></CardTitle><span className="text-xs text-fg-muted">Drag or use the arrows; the till shows this order.</span></CardHeader>
          <CardBody className="space-y-1 p-2">
            {saved.isLoading || pinned === null ? <Loading /> : pinned.length ? (
              <SortableList items={pinned} getId={(p) => p.key} onReorder={setPinned} disabled={busy}>
                {(p, i, handle) => (
                  <div key={p.key} ref={handle.ref as React.Ref<HTMLDivElement>} style={handle.style} className={cn("flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-sm", handle.dragging && "shadow-[var(--elev-1)]")}>
                    <DragHandle handle={handle} />
                    <span className="w-6 text-xs text-fg-muted tabular">{i + 1}</span>
                    <Thumb src={p.image_key} />
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{p.name}</span>{p.variant_name ? <span className="ml-2 text-fg-secondary">{p.variant_name}</span> : null}{!p.active ? <Badge className="ml-2">inactive</Badge> : null}</span>
                    <span className="shrink-0 text-xs text-fg-muted tabular">{formatMoney(p.price_minor)}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === pinned.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeAt(p.key)} aria-label="Remove from Quick Add"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                )}
              </SortableList>
            ) : <EmptyState icon={Zap} title="Nothing pinned yet" hint="Pick fast movers such as roti, water and drinks from the list on the left." className="py-8" />}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
