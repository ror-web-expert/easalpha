"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PieChart, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { FoodCostReport } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { Cards, PageHeader } from "@/components/admin/page";
import { Badge, Button, Checkbox, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

export default function FoodCostPage() {
  const qc = useQueryClient();
  const report = useQuery({ queryKey: ["food_cost"], queryFn: () => api<FoodCostReport>("/recipes/food_cost") });
  const [onlyOver, setOnlyOver] = useState(false);
  const [recosting, setRecosting] = useState(false);
  const recost = async () => {
    setRecosting(true);
    try { await api("/recipes/recost", { method: "POST" }); ["food_cost", "recipes", "recipe"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.success("All recipes recosted"); }
    catch (e) { toast.error("Could not recost", errorMessage(e)); }
    finally { setRecosting(false); }
  };
  const d = report.data;
  const rows = (d?.data ?? []).filter((r) => !onlyOver || r.over_target);
  const avg = d?.data.length ? d.data.reduce((a, r) => a + (r.percent ?? 0), 0) / d.data.length : 0;
  return (
    <>
      <PageHeader icon={PieChart} title="Food cost" description="Ingredient cost against the selling price before tax, per product recipe. Costs follow average purchase prices; recost after a big price change." actions={<Button variant="secondary" onClick={recost} loading={recosting}><RefreshCw className="h-4 w-4" /> Recost all</Button>} />
      <Cards>
        <SummaryCard label="Target" value={formatPercent(d?.target_percent ?? 0)} sub={<Link href="/admin/stock/settings" className="text-primary hover:underline">Change in stock settings</Link>} tone="neutral" />
        <SummaryCard label="Over target" value={d?.over_target ?? 0} sub={`of ${d?.data.length ?? 0} recipes`} tone={d?.over_target ? "danger" : "success"} />
        <SummaryCard label="Average food cost" value={formatPercent(avg)} sub="Simple average across recipes" tone="info" />
      </Cards>
      <div className="mb-3"><Checkbox label="Only over target" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /></div>
      {report.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Product</TH><TH>Recipe</TH><TH right>Cost</TH><TH right>Price before tax</TH><TH right>Margin</TH><TH right>Food cost</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => (
              <TR key={r.recipe_id} className={r.over_target ? "bg-danger-soft/40" : ""}>
                <TD className="font-medium">{r.product}{r.variant ? <span className="ml-1 text-fg-secondary">· {r.variant}</span> : null}</TD>
                <TD><Link href={`/admin/stock/recipes/${r.recipe_id}`} className="text-primary hover:underline">{r.name}</Link></TD>
                <TD right>{formatMoney(r.cost_minor)}</TD>
                <TD right>{formatMoney(r.price_ex_tax_minor)}</TD>
                <TD right className={r.price_ex_tax_minor - r.cost_minor < 0 ? "text-danger" : ""}>{formatMoney(r.price_ex_tax_minor - r.cost_minor)}</TD>
                <TD right className={r.over_target ? "font-semibold text-danger" : "font-medium"}>{r.percent === null ? "-" : formatPercent(r.percent)}{r.over_target ? <Badge className="ml-2" variant="danger">over {formatPercent(r.target_percent, 0)}</Badge> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={6}>{onlyOver ? "Nothing over target." : "No product recipes yet."}</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
