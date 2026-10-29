"use client";
// Workers: every employee, whether their fingerprint is enrolled and whether meals have an account to land on.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Link2, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { CanteenWorker } from "@/lib/types";
import { Cards, FilterBar, PageHeader, SearchInput } from "@/components/admin/page";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

export default function CanteenWorkersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [enrol, setEnrol] = useState<CanteenWorker | null>(null);
  const [fid, setFid] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["canteen_workers"], queryFn: () => api<{ data: CanteenWorker[]; linked: number; enrolled: number }>("/canteen/workers") });
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list.data?.data ?? []).filter((w) => !t || w.name.toLowerCase().includes(t) || (w.phone ?? "").includes(t) || (w.cnic ?? "").includes(t) || (w.department ?? "").toLowerCase().includes(t));
  }, [list.data, q]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["canteen_workers"] });
  const linkAll = async () => {
    setBusy("link");
    try { const r = await api<{ linked: number }>("/canteen/workers/link", { method: "POST", body: { all: true } }); toast.success(`${r.linked} worker${r.linked === 1 ? "" : "s"} given an account`); refresh(); }
    catch (e) { toast.error("Could not link", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const saveFingerprint = async () => {
    if (!enrol) return;
    setBusy("fid");
    try { await api(`/canteen/workers/${enrol.id}/fingerprint`, { method: "POST", body: { fingerprint_id: fid.trim() } }); toast.success(`${enrol.name} enrolled`); setEnrol(null); refresh(); }
    catch (e) { toast.error("Could not enrol", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const total = list.data?.data.length ?? 0;
  return (
    <>
      <PageHeader icon={Fingerprint} title="Workers" description="Workers are the employees under Payroll. Each needs a fingerprint id from the reader (the same one attendance uses) and an account for meals; the account is made on the first meal if it is missing."
        actions={<><Link href="/admin/payroll/employees" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-fg hover:bg-muted"><UserPlus className="h-4 w-4" /> Add employees</Link><Button loading={busy === "link"} onClick={linkAll} disabled={!list.data || list.data.linked === total}><Link2 className="h-4 w-4" /> Give every worker an account</Button></>} />
      {list.isLoading ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Workers" value={total} />
            <SummaryCard label="Fingerprint enrolled" value={list.data?.enrolled ?? 0} tone={list.data && list.data.enrolled < total ? "warning" : "success"} sub={`${total - (list.data?.enrolled ?? 0)} still to enrol`} />
            <SummaryCard label="With an account" value={list.data?.linked ?? 0} tone="primary" />
          </Cards>
          <FilterBar><SearchInput value={q} onChange={setQ} placeholder="Name, phone, CNIC or department" /></FilterBar>
          <Table>
            <THead><tr><TH>Worker</TH><TH>Department</TH><TH>Phone</TH><TH>Fingerprint</TH><TH>Account</TH><TH right>Actions</TH></tr></THead>
            <TBody>
              {rows.length ? rows.map((w) => (
                <TR key={w.id}>
                  <TD className="font-medium">{w.name}{w.designation ? <div className="text-xs font-normal text-fg-muted">{w.designation}</div> : null}</TD>
                  <TD className="text-fg-secondary">{w.department ?? "-"}</TD>
                  <TD className="tabular text-fg-secondary">{w.phone ?? "-"}</TD>
                  <TD>{w.fingerprint_enrolled ? <Badge variant="success">{w.fingerprint_id}</Badge> : <Badge variant="warning">not enrolled</Badge>}</TD>
                  <TD>{w.customer_id ? <Link className="text-primary" href={`/admin/customers/${w.customer_id}`}>ledger</Link> : <span className="text-fg-muted">on first meal</span>}</TD>
                  <TD right>
                    <Button variant="ghost" size="sm" onClick={() => { setEnrol(w); setFid(w.fingerprint_id ?? ""); }}><Fingerprint className="h-4 w-4" /> {w.fingerprint_enrolled ? "Change" : "Enrol"}</Button>
                    <Link href={`/admin/canteen/reports?worker=${w.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted">Meals</Link>
                  </TD>
                </TR>
              )) : <EmptyRow colSpan={6}>{total ? "Nobody matches." : "No employees yet. Add them under Payroll, Employees (or import a CSV there)."}</EmptyRow>}
            </TBody>
          </Table>
        </>
      )}
      <Dialog open={!!enrol} onClose={() => setEnrol(null)} title={enrol ? `Enrol ${enrol.name}` : ""} description="Put the worker's finger on the reader; it types its id here. Or type the id your biometric device shows for this worker." size="sm"
        footer={<><Button variant="secondary" onClick={() => setEnrol(null)}>Cancel</Button><Button loading={busy === "fid"} disabled={fid.trim().length < 2} onClick={saveFingerprint}>Save</Button></>}>
        <Field label="Fingerprint id"><Input autoFocus value={fid} onChange={(e) => setFid(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveFingerprint(); }} placeholder="e.g. 1042 or FP-001" /></Field>
      </Dialog>
    </>
  );
}
