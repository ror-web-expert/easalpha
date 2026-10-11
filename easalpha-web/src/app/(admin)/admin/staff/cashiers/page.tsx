"use client";
import { UserCircle } from "lucide-react";
import { StaffList } from "@/components/admin/staff-list";

export default function CashiersPage() {
  return <StaffList staffType="cashier" title="Cashiers" description="Roles: Cashier, Supervisor, Kitchen Display. They carry sessions and tills." icon={UserCircle} />;
}
