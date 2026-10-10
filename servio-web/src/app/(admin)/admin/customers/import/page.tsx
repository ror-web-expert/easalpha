"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { PageHeader } from "@/components/admin/page";
import { Button, Card, CardBody, Field, Textarea, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

export default function ImportPage() {
  const [data, setData] = useState("name,phone,email,company,group,address,notes\n");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; error_rows: { line: number; error: string }[] } | null>(null);
  const onFile = (f: File | undefined) => { if (!f) return; f.text().then(setData); };
  const submit = async () => {
    setBusy(true);
    try { setResult(await api("/customers/import", { method: "POST", body: { data } })); toast.success("Import finished"); }
    catch (e) { toast.error("Import failed", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={Upload} title="Import customers" description="CSV with headers: name, phone, email, company, group, address, notes. Existing phones are updated." />
      <Card>
        <CardBody className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <Field label="Or paste CSV"><Textarea className="min-h-56 font-mono text-xs" value={data} onChange={(e) => setData(e.target.value)} /></Field>
          <Button onClick={submit} loading={busy} disabled={data.trim().split("\n").length < 2}>Import</Button>
        </CardBody>
      </Card>
      {result ? (
        <Card className="mt-4">
          <CardBody>
            <p className="text-sm">Created <b>{result.created}</b>, updated <b>{result.updated}</b>, errors <b>{result.error_rows.length}</b>.</p>
            {result.error_rows.length ? (
              <Table><THead><tr><TH>Line</TH><TH>Error</TH></tr></THead><TBody>{result.error_rows.map((r) => <TR key={r.line}><TD>{r.line}</TD><TD className="text-danger">{r.error}</TD></TR>)}</TBody></Table>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
