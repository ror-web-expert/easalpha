"use client";
// SPEC Attendance screens, in order: Today, Sessions, Scan Log, Ledger, Enrolled, Reports, Leave, Holidays,
// Employee Rules and Defaults. One hub under Payroll > Fingerprint; ?tab= deep-links a tab.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { EmployeeSelect, PayrollGuard, useBusinessHours } from "@/components/admin/payroll-shared";
import { AttendanceReportsTab, EnrolledTab, LedgerTab, ScanLogTab, SessionsTab, TodayTab } from "@/components/admin/payroll-attendance";
import { HolidaysTab, LeaveTab } from "@/components/admin/payroll-leave";
import { DefaultRulesForm, EmployeeRulesForm } from "@/components/admin/payroll-rules-form";
import { Loading, Tabs } from "@/components/ui";

const TABS = [
  { value: "today", label: "Today" }, { value: "sessions", label: "Sessions" }, { value: "scans", label: "Scan Log" }, { value: "ledger", label: "Ledger" }, { value: "enrolled", label: "Enrolled" },
  { value: "reports", label: "Reports" }, { value: "leave", label: "Leave" }, { value: "holidays", label: "Holidays" }, { value: "employee-rules", label: "Employee Rules" }, { value: "defaults", label: "Defaults" },
] as const;
type Tab = (typeof TABS)[number]["value"];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v);

function EmployeeRulesTab() {
  const [employee, setEmployee] = useState("");
  const hours = useBusinessHours();
  return (
    <>
      <FilterBar><EmployeeSelect value={employee} onChange={setEmployee} autoSelectFirst /><span className="text-sm text-fg-secondary">Per-employee rules override the business defaults.</span></FilterBar>
      {employee ? <EmployeeRulesForm employeeId={employee} businessHours={hours} /> : <Loading />}
    </>
  );
}

function AttendanceHub() {
  const params = useSearchParams();
  const router = useRouter();
  const fromUrl = params.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(fromUrl) ? fromUrl : "today");
  useEffect(() => { if (isTab(fromUrl) && fromUrl !== tab) setTab(fromUrl); }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const hours = useBusinessHours();
  const change = (t: Tab) => { setTab(t); router.replace(`/admin/payroll/fingerprint?tab=${t}`, { scroll: false }); };
  return (
    <>
      <PageHeader icon={Fingerprint} title="Fingerprint attendance" description={`The scanner counts the days and payroll prices them. Business hours${hours ? ` (${hours})` : ""} are the last fallback for a shift start.`} />
      <Tabs value={tab} onChange={change} items={TABS.map((t) => ({ value: t.value, label: t.label }))} className="mb-4" />
      {tab === "today" ? <TodayTab /> : null}
      {tab === "sessions" ? <SessionsTab /> : null}
      {tab === "scans" ? <ScanLogTab /> : null}
      {tab === "ledger" ? <LedgerTab /> : null}
      {tab === "enrolled" ? <EnrolledTab /> : null}
      {tab === "reports" ? <AttendanceReportsTab /> : null}
      {tab === "leave" ? <LeaveTab /> : null}
      {tab === "holidays" ? <HolidaysTab /> : null}
      {tab === "employee-rules" ? <EmployeeRulesTab /> : null}
      {tab === "defaults" ? <DefaultRulesForm businessHours={hours} /> : null}
    </>
  );
}

export default function FingerprintPage() {
  return <PayrollGuard><Suspense fallback={<Loading />}><AttendanceHub /></Suspense></PayrollGuard>;
}
