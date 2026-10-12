"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { useModules } from "@/lib/modules";
import { PageHeader } from "@/components/admin/page";
import { importColumns, templateTable } from "@/components/admin/customer-accounts-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Textarea, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

// Customers from a CSV: contact details, group, room, roll or ID number and guardian, and with customer accounts on,
// the credit limit and the opening balance carried over from a paper register. A row updates the customer with the
// same phone, else the same roll number; otherwise it adds a new customer.

interface ImportResult { created: number; updated: number; openings?: number; error_rows: { line: number; error: string }[] }

const stripBom = (s: string) => s.replace(/^﻿/, "");

function importError(e: unknown): string {
  const code = errorCode(e);
  if (code === "permission.denied") return "Opening balances need the Adjust balances permission. Ask the owner, or remove the opening_balance column and import again.";
  if (code === "module.disabled") return "Customer accounts are switched off, so opening balances cannot be imported. Remove the opening_balance column, or ask the owner to switch customer accounts on.";
  return errorMessage(e);
}

export default function ImportPage() {
  const khata = useModules().customer_accounts;
  const columns = importColumns(khata);
  const header = columns.map((c) => c.key).join(",");
  const [typed, setTyped] = useState<string | null>(null);
  const data = typed ?? `${header}\n`;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const onFile = (f: File | undefined) => { if (!f) return; f.text().then((t) => { setTyped(stripBom(t)); setResult(null); setFailure(null); }); };
  const rowsTyped = stripBom(data).trim().split(/\r?\n/).length - 1;
  const submit = async () => {
    setBusy(true); setFailure(null);
    try {
      const r = await api<ImportResult>("/customers/import", { method: "POST", body: { data: stripBom(data) }, timeoutMs: 120_000 });
      setResult(r);
      toast.success("Import finished", `${r.created} added, ${r.updated} updated${r.error_rows.length ? `, ${r.error_rows.length} rows with errors` : ""}.`);
    } catch (e) {
      const msg = importError(e);
      setFailure(msg);
      toast.error("Import failed", msg);
    } finally { setBusy(false); }
  };
  const downloadTemplate = () => { const t = templateTable(khata); downloadCsv("customers-import-template", t.columns, t.rows); };
  return (
    <>
      <PageHeader icon={Upload} title="Import customers" description="Add or update many customers from a CSV file. A row with a known phone, or else a known roll number, updates that customer." actions={
        <Button variant="secondary" onClick={downloadTemplate}><Download className="h-4 w-4" /> Download template CSV</Button>
      } />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your file</CardTitle><span className="text-xs text-fg-muted">{rowsTyped > 0 ? `${rowsTyped} ${rowsTyped === 1 ? "row" : "rows"}` : "Header only"}</span></CardHeader>
          <CardBody className="space-y-3">
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
            <Field label="Or paste CSV" hint="The first line names the columns. Columns can be in any order; unknown columns are ignored.">
              <Textarea className="min-h-56 font-mono text-xs" value={data} onChange={(e) => { setTyped(e.target.value); setFailure(null); }} spellCheck={false} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={submit} loading={busy} disabled={rowsTyped < 1}>Import</Button>
              {typed !== null ? <Button variant="ghost" onClick={() => { setTyped(null); setResult(null); setFailure(null); }}>Start again</Button> : null}
            </div>
            {failure ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">{failure}</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Columns</CardTitle><span className="text-xs text-fg-muted">Amounts in rupees</span></CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-table-head text-left text-[13px] font-semibold text-heading"><tr><th className="h-10 px-5">Column</th><th className="h-10 px-3">What to enter</th><th className="h-10 px-5">Example</th></tr></thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.key} className="border-t align-top">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs">{c.key}{c.key === "name" ? <Badge variant="danger" className="ml-2">required</Badge> : null}</td>
                    <td className="px-3 py-2.5 text-fg-secondary">{c.help}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-fg-secondary">{c.examples[0] || c.examples[1] || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {khata ? (
              <p className="border-t px-5 py-3 text-xs text-fg-muted">Opening balances need the Adjust balances permission. A customer who already has an opening balance keeps it; the row is listed under errors.</p>
            ) : (
              <p className="border-t px-5 py-3 text-xs text-fg-muted">Credit limits and opening balances can be imported once customer accounts are switched on in Settings, Modules.</p>
            )}
          </CardBody>
        </Card>
      </div>
      {result ? (
        <Card className="mt-4">
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="success">{result.created} added</Badge>
              <Badge variant="info">{result.updated} updated</Badge>
              {khata || result.openings ? <Badge variant="primary">{result.openings ?? 0} opening balances</Badge> : null}
              <Badge variant={result.error_rows.length ? "danger" : "neutral"}>{result.error_rows.length} {result.error_rows.length === 1 ? "row" : "rows"} with errors</Badge>
            </div>
            {result.error_rows.length ? (
              <Table compact><THead><tr><TH>Line</TH><TH>Error</TH></tr></THead><TBody>{result.error_rows.map((r, i) => <TR key={`${r.line}-${i}`}><TD className="tabular">{r.line}</TD><TD className="text-danger">{r.error}</TD></TR>)}</TBody></Table>
            ) : <p className="text-sm text-fg-secondary">Every row was imported.</p>}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
