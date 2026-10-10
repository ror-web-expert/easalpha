"use client";
import { Shield } from "lucide-react";
import { StaffList } from "@/components/admin/staff-list";

export default function AdminStaffPage() {
  return <StaffList staffType="admin" title="Admin Staff" description="Back-office users of this admin panel." icon={Shield} />;
}
