"use client";
// SPEC "Report catalogue": every report screen has the same frame. Title and one-line answer, a date range where the
// report takes one, and Export CSV and Export PDF built from the rows the screen is showing.
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf, type PdfColumn } from "@/lib/pdf";
import { DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Button, ErrorState, Loading } from "@/components/ui";

export interface ReportExport {
  /** File stem, e.g. "sales"; the range or month is appended. */
  name: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
  /** Lines under the PDF table, typically the totals. */
  footer?: string[];
  landscape?: boolean;
  /** Subtitle on the PDF; defaults to the range. */
  subtitle?: string;
}

export function useReport<T>(name: string, range: DateRange, query: Record<string, string | number | boolean | null | undefined> = {}, enabled = true) {
  return useQuery({ queryKey: ["report", name, range, query], queryFn: () => api<T>(`/reports/${name}`, { query: { from: range.from, to: range.to, ...query } }), enabled });
}

export function ReportShell({ icon, title, description, range, onRange, filters, actions, exportData, loading, error, onRetry, children }: {
  icon: LucideIcon; title: string; description: string;
  range?: DateRange; onRange?: (r: DateRange) => void;
  filters?: React.ReactNode; actions?: React.ReactNode;
  exportData?: ReportExport;
  loading?: boolean; error?: boolean; onRetry?: () => void;
  children: React.ReactNode;
}) {
  const stamp = exportData?.subtitle ?? (range ? `${range.from} to ${range.to}` : undefined);
  const stem = exportData ? `${exportData.name}${range ? `-${range.from}-${range.to}` : ""}` : "";
  const canExport = !!exportData?.rows.length;
  const exportCsv = () => { if (exportData) downloadCsv(`${stem}.csv`, exportData.columns, exportData.rows); };
  const exportPdf = () => {
    if (!exportData) return;
    exportTablePdf({ title, subtitle: stamp, columns: exportData.columns, rows: exportData.rows, footer: exportData.footer, filename: `${stem}.pdf`, landscape: exportData.landscape ?? exportData.columns.length > 6 });
  };
  return (
    <>
      <PageHeader icon={icon} title={title} description={description}
        actions={<>
          {actions}
          {exportData ? <Button variant="secondary" onClick={exportCsv} disabled={!canExport}><FileSpreadsheet className="h-4 w-4" /> Export CSV</Button> : null}
          {exportData ? <Button variant="secondary" onClick={exportPdf} disabled={!canExport}><FileDown className="h-4 w-4" /> Export PDF</Button> : null}
        </>} />
      {range && onRange || filters ? (
        <FilterBar className="no-print">
          {range && onRange ? <DateRangePicker value={range} onChange={onRange} /> : null}
          {filters}
        </FilterBar>
      ) : null}
      <div className="print-area">
        {loading ? <Loading /> : error ? <ErrorState message={`Could not load the ${title} report`} onRetry={onRetry} /> : children}
      </div>
    </>
  );
}

/** A labelled share bar: amount on the right, the bar's width is the share of the whole. */
export function ShareBar({ percent, className }: { percent: number | null | undefined; className?: string }) {
  const n = Math.min(100, Math.max(0, Number(percent ?? 0)));
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="h-2 w-24 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: n > 0 ? `${Math.max(2, n)}%` : "0%" }} /></div>
      <span className="w-12 text-right text-xs tabular text-fg-secondary">{n.toFixed(1)}%</span>
    </div>
  );
}

/** A statement line for the Financial report: label, amount, optional emphasis. */
export function StatementLine({ label, value, strong, indent, tone, right }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; indent?: boolean; tone?: "success" | "danger"; right?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? "border-t font-medium" : ""} ${indent ? "pl-4 text-fg-secondary" : ""}`}>
      <span className="flex items-center gap-2">{label}{right}</span>
      <span className={`tabular ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : ""}`}>{value}</span>
    </div>
  );
}
