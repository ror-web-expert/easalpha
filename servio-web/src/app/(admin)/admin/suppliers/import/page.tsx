"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { PageHeader } from "@/components/admin/page";
import { Button, Card, CardBody, Field, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

export default function ImportSuppliersPage() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("name,contact,phone,email,address,terms,opening_balance\n");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const onFile = (f: File | undefined) => { if (!f) return; f.text().then(setCsv); };
  const submit = async () => {
    setBusy(true);
    try {
      setResult(await api("/suppliers/import", { method: "POST", body: { csv } }));
      ["suppliers", "suppliers_all", "purchasing_summary", "purchasing_aging"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Import finished");
    } catch (e) { toast.error("Import failed", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={Upload} title="Import suppliers" description="CSV with headers: name, contact, phone, email, address, terms (days), opening_balance (rupees). Existing names are updated; the opening balance applies to new suppliers only." actions={<Link href="/admin/suppliers"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Suppliers</Button></Link>} />
      <Card>
        <CardBody className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <Field label="Or paste CSV"><Textarea className="min-h-56 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
          <Button onClick={submit} loading={busy} disabled={csv.trim().split("\n").length < 2}>Import</Button>
        </CardBody>
      </Card>
      {result ? <Card className="mt-4"><CardBody><p className="text-sm">Created <b>{result.created}</b>, updated <b>{result.updated}</b>. <Link href="/admin/suppliers" className="text-primary hover:underline">See suppliers</Link></p></CardBody></Card> : null}
    </>
  );
}
