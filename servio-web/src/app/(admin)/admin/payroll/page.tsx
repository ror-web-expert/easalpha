import { redirect } from "next/navigation";

// The Payroll group opens on its Overview (SPEC "Payroll. The overview tracks...").
export default function PayrollIndexPage() {
  redirect("/admin/payroll/overview");
}
