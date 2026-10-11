"use client";
import { useState } from "react";
import Link from "next/link";
import { Upload, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import type { StockImportPreview, StockImportResult } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const TEMPLATE = "name,sku,category,unit,purchase_unit,minimum,reorder,opening_qty,cost,section\n";

export default function StockImportPage() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState(TEMPLATE);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [preview, setPreview] = useState<StockImportPreview | null>(null);
  const [result, setResult] = useState<StockImportResult | null>(null);
  const onFile = (f: File | undefined) => { if (!f) return; f.text().then((t) => { setCsv(t); setPreview(null); setResult(null); }); };
  const runPreview = async () => {
    setBusy("preview"); setResult(null);
    try { setPreview(await api<StockImportPreview>("/stock_items/import/preview", { method: "POST", body: { csv } })); }
    catch (e) { toast.error("Could not read the CSV", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const runImport = async () => {
    setBusy("import");
    try {
      setResult(await api<StockImportResult>("/stock_items/import", { method: "POST", body: { csv } }));
      ["stock_items", "stock_levels", "stock_valuation", "stock_categories", "stock_documents"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Import finished");
    } catch (e) { toast.error("Import failed", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const hasRows = csv.trim().split("\n").length >= 2;
  return (
    <>
      <PageHeader icon={Upload} title="Import stock items" description="CSV with headers: name, sku, category, unit, purchase_unit, minimum, reorder, opening_qty, cost, section. Unit codes must exist (g, kg, ml, l, pcs, dz or your own). Opening quantities post as an adjustment document per section; cost is in rupees per unit. Existing SKUs or names are updated." actions={<Link href="/admin/inventory/items"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Items</Button></Link>} />
      <Card>
        <CardBody className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <Field label="Or paste CSV" hint="ArfaPOS item exports work: Item Name, Code, Category, Unit, Min, Opening, Cost."><Textarea className="min-h-56 font-mono text-xs" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setResult(null); }} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={runPreview} loading={busy === "preview"} disabled={!hasRows || busy === "import"}>Preview</Button>
            <Button onClick={runImport} loading={busy === "import"} disabled={!preview || preview.valid_count === 0 || busy === "preview"}>{preview ? `Import ${preview.valid_count} valid row${preview.valid_count === 1 ? "" : "s"}` : "Import"}</Button>
          </div>
        </CardBody>
      </Card>
      {preview ? (
        <Card className="mt-4">
          <CardHeader><CardTitle>Preview</CardTitle><span className="text-sm text-fg-secondary">{preview.row_count} rows · <span className="text-success">{preview.valid_count} valid</span> · <span className={preview.error_rows.length ? "text-danger" : ""}>{preview.error_rows.length} with errors</span></span></CardHeader>
          <Table>
            <THead><tr><TH>Line</TH><TH>Name</TH><TH>SKU</TH><TH>Category</TH><TH>Unit</TH><TH>Buy in</TH><TH right>Min</TH><TH right>Reorder</TH><TH right>Opening</TH><TH right>Cost</TH><TH>Section</TH><TH>Status</TH></tr></THead>
            <TBody>
              {preview.rows.map((r) => (
                <TR key={r.line} className={r.error ? "bg-danger-soft/30" : ""}>
                  <TD className="text-fg-muted">{r.line}</TD><TD className="font-medium">{r.name || <span className="text-fg-muted">(blank)</span>}</TD><TD className="font-mono text-xs">{r.sku ?? ""}</TD><TD>{r.category ?? ""}</TD><TD>{r.unit}</TD><TD>{r.purchase_unit ?? ""}</TD>
                  <TD right>{r.minimum ?? ""}</TD><TD right>{r.reorder ?? ""}</TD><TD right>{r.opening_qty ?? ""}</TD><TD right>{r.cost ?? ""}</TD><TD>{r.section ?? ""}</TD>
                  <TD>{r.error ? <Badge variant="danger">{r.error}</Badge> : <Badge variant="success">ok</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {preview.row_count > preview.rows.length ? <p className="px-4 py-2 text-xs text-fg-muted">Showing the first {preview.rows.length} of {preview.row_count} rows.</p> : null}
        </Card>
      ) : null}
      {result ? (
        <Card className="mt-4">
          <CardBody className="space-y-2">
            <p className="text-sm">Created <b>{result.created}</b>, updated <b>{result.updated}</b>, skipped <b>{result.skipped}</b>.</p>
            {result.opening_documents.length ? <p className="text-sm text-fg-secondary">Opening stock posted as {result.opening_documents.join(", ")}. <Link href="/admin/inventory/stock-actions" className="text-primary hover:underline">View documents</Link></p> : null}
            <Link href="/admin/inventory/items" className="text-sm text-primary hover:underline">Go to items</Link>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
