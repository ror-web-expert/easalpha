"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChefHat, Percent, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import type { AnalysisBlock, ProductAnalysis } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { figureTone, orderTypeLabel, profitTone, shareOfCost } from "@/components/admin/catalog-grid-helpers";
import { Badge, Button, Dialog, EmptyState, ErrorState, Loading, SummaryCard, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

/** Product Analysis: what one serving earns at today's average costs, per variant and per order type. Opened from a
 *  catalogue tile or the product page; the figures come from GET /products/:id/analysis. */
export function ProductAnalysisDialog({ productId, open, onClose }: { productId: string | null; open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: ["product_analysis", productId], queryFn: () => api<ProductAnalysis>(`/products/${productId}/analysis`), enabled: open && !!productId });
  const [variant, setVariant] = useState("");
  useEffect(() => { setVariant(q.data?.variants[0]?.variant_id ?? ""); }, [q.data]);
  const block = q.data?.variants.find((b) => (b.variant_id ?? "") === variant) ?? q.data?.variants[0];
  return (
    <Dialog open={open} onClose={onClose} size="xl" title="Product analysis" description={q.data ? `${q.data.product.name}: what one serving earns at today's average ingredient costs` : undefined}
      footer={<>{productId ? <Link href={`/admin/products/catalog/${productId}`}><Button variant="secondary">Edit product</Button></Link> : null}<Button onClick={onClose}>Close</Button></>}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message="Could not load the analysis" onRetry={() => q.refetch()} /> : q.data && block ? (
        <div className="space-y-5">
          {q.data.variants.length > 1 ? <Tabs value={variant} onChange={setVariant} items={q.data.variants.map((b) => ({ value: b.variant_id ?? "", label: b.name }))} /> : null}
          <Figures block={block} target={q.data.target_percent} />
          <Ingredients block={block} productId={q.data.product.id} />
          <OrderTypes block={block} />
        </div>
      ) : null}
    </Dialog>
  );
}

function Figures({ block, target }: { block: AnalysisBlock; target: number }) {
  const noRecipe = block.ingredient_cost_minor === null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard size="compact" tone="primary" icon={Receipt} label="Selling price" value={formatMoney(block.price_minor)} sub={block.price_ex_tax_minor !== block.price_minor ? `${formatMoney(block.price_ex_tax_minor)} before tax` : "Tax is added on top"} />
      <SummaryCard size="compact" tone="warning" icon={ChefHat} label="Ingredient cost" value={noRecipe ? "-" : formatMoney(block.ingredient_cost_minor)} sub={noRecipe ? "No recipe yet" : `${block.lines.length} ingredient${block.lines.length === 1 ? "" : "s"}`} />
      <SummaryCard size="compact" tone={profitTone(block.profit_minor)} icon={Wallet} label="Profit" value={block.profit_minor === null ? "-" : formatMoney(block.profit_minor)} sub="Per serving, before tax" />
      <SummaryCard size="compact" tone={figureTone(block.margin_percent, block.over_target)} icon={Percent} label="Margin" value={block.margin_percent === null ? "-" : formatPercent(block.margin_percent, 1)}
        sub={block.food_cost_percent === null ? `Food cost target ${formatPercent(target, 0)}` : `Food cost ${formatPercent(block.food_cost_percent, 1)}, target ${formatPercent(target, 0)}`} />
    </div>
  );
}

function Ingredients({ block, productId }: { block: AnalysisBlock; productId: string }) {
  if (!block.lines.length) {
    return <EmptyState icon={ChefHat} title="No recipe yet" hint="Add the ingredients on the product's Ingredients tab and the cost, profit and margin fill in here." action={<Link href={`/admin/products/catalog/${productId}`}><Button size="sm" variant="secondary">Open the product</Button></Link>} />;
  }
  const shares = shareOfCost(block.lines);
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-heading">
        Ingredients{block.recipe ? <span className="ml-2 font-normal text-fg-muted">{block.recipe.name}{Number(block.recipe.yield_qty) > 1 ? `, one serving of ${block.recipe.yield_qty}` : ""}</span> : null}
      </h3>
      <Table>
        <THead><tr><TH>Item</TH><TH right>Quantity</TH><TH right>Cost</TH><TH className="w-44">Share of cost</TH></tr></THead>
        <TBody>
          {block.lines.map((l, i) => (
            <TR key={`${l.item_name}-${i}`}>
              <TD className="font-medium">{l.item_name}{l.waste_percent ? <span className="ml-2 text-xs text-fg-muted">+{l.waste_percent}% waste</span> : null}</TD>
              <TD right className="text-fg-secondary tabular">{l.quantity} {l.unit_code}</TD>
              <TD right className="font-medium tabular">{formatMoney(l.cost_minor)}</TD>
              <TD>
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-cta" style={{ width: `${shares[i]}%` }} /></span>
                  <span className="w-9 text-right text-xs text-fg-muted tabular">{shares[i]}%</span>
                </span>
              </TD>
            </TR>
          ))}
          <TR><TD className="font-semibold">Total</TD><TD /><TD right className="font-semibold tabular">{formatMoney(block.ingredient_cost_minor ?? 0)}</TD><TD /></TR>
        </TBody>
      </Table>
    </section>
  );
}

function OrderTypes({ block }: { block: AnalysisBlock }) {
  const noRecipe = block.ingredient_cost_minor === null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-heading">By order type <span className="ml-2 font-normal text-fg-muted">That order type&apos;s price, plus its packaging and extras from Order Inventory</span></h3>
      <Table>
        <THead><tr><TH>Order type</TH><TH right>Price</TH><TH right>Packaging and extras</TH><TH right>Total cost</TH><TH right>Profit</TH><TH right>Margin</TH></tr></THead>
        <TBody>
          {block.order_types.map((o) => {
            const tone = figureTone(o.margin_percent, o.over_target);
            return (
              <TR key={o.order_type}>
                <TD className="font-medium">{orderTypeLabel(o.order_type)}{o.consumables.length ? <span className="ml-2 text-xs font-normal text-fg-muted">{o.consumables.map((c) => `${c.quantity} ${c.unit_code} ${c.item_name}`).join(", ")}</span> : null}</TD>
                <TD right className="tabular">{formatMoney(o.price_minor)}{o.price_minor !== block.price_minor ? <span className="ml-1 text-xs text-fg-muted">own price</span> : null}</TD>
                <TD right className="tabular">{o.extra_cost_minor ? formatMoney(o.extra_cost_minor) : <span className="text-fg-muted">-</span>}</TD>
                <TD right className="tabular">{noRecipe ? "-" : formatMoney(o.total_cost_minor ?? 0)}</TD>
                <TD right className={cn("font-medium tabular", o.profit_minor !== null && o.profit_minor <= 0 && "text-danger")}>{o.profit_minor === null ? "-" : formatMoney(o.profit_minor)}</TD>
                <TD right>{tone === "neutral" ? <span className="text-fg-muted">-</span> : <Badge variant={tone}>{formatPercent(o.margin_percent, 1)}</Badge>}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </section>
  );
}
