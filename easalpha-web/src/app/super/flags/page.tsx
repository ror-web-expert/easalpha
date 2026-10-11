"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { flagScopeLabel } from "@/components/super/super-helpers";
import { useAction } from "@/components/admin/crud";
import type { FeatureFlagRow } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, Field, Input, Loading, Switch, TBody, TD, TH, THead, TR, Table } from "@/components/ui";

interface Upsert { key: string; enabled: boolean; business_id: string | null }

export default function SuperFlagsPage() {
  const sapi = useSuperApi();
  const list = useQuery({ queryKey: superKey("feature_flags"), queryFn: () => sapi<{ data: FeatureFlagRow[] }>("/super/feature_flags") });
  const rows = list.data?.data ?? [];
  const upsert = useAction<Upsert>(["super"], (body) => sapi("/super/feature_flags", { method: "PUT", body }), "Flag saved");
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [businessId, setBusinessId] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate({ key: key.trim(), enabled, business_id: businessId.trim() || null }, { onSuccess: () => { setKey(""); setBusinessId(""); setEnabled(true); } });
  };

  return (
    <>
      <SuperPageHeader title="Feature flags" description="Turn a feature on or off for every business (global) or for one business by its id. A business row overrides the global one." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <ErrorNote error={list.error} />
          <Table compact>
            <THead><tr><TH>Key</TH><TH>Scope</TH><TH>Enabled</TH></tr></THead>
            <TBody>
              {list.isLoading ? <tr><td colSpan={3}><Loading /></td></tr> : rows.length === 0 ? <EmptyRow colSpan={3}>No flags yet. Add one on the right.</EmptyRow> : rows.map((f) => (
                <TR key={f.id}>
                  <TD className="font-mono text-xs">{f.key}</TD>
                  <TD>{f.business_id ? <span className="font-mono text-xs" title={f.business_id}>{flagScopeLabel(f.business_id)}</span> : <Badge variant="primary">Global</Badge>}</TD>
                  <TD><Switch checked={f.enabled} disabled={upsert.isPending} onChange={(v) => upsert.mutate({ key: f.key, enabled: v, business_id: f.business_id })} label={f.enabled ? "On" : "Off"} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <Card className="self-start">
          <CardHeader><CardTitle>Add or change a flag</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Key" hint="snake_case, e.g. new_reports. Saving an existing key and scope updates it."><Input value={key} onChange={(e) => setKey(e.target.value)} required pattern="[a-z0-9_.-]+" className="font-mono" /></Field>
              <Field label="Business id (optional)" hint="Blank = global. Paste the id from a business page URL."><Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="font-mono" placeholder="Global" /></Field>
              <Switch checked={enabled} onChange={setEnabled} label={enabled ? "Enabled" : "Disabled"} />
              <Button type="submit" className="w-full" loading={upsert.isPending} disabled={!key.trim()}>Save flag</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
