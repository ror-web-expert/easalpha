"use client";
import { ClipboardSignature } from "lucide-react";
import { StaffList } from "@/components/admin/staff-list";

export default function OrderTakersPage() {
  return <StaffList staffType="order_taker" title="Order Takers" description="Floor staff who punch walk-in orders; tracked for daily performance." icon={ClipboardSignature} />;
}
