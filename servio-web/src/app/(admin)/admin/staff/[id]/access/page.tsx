"use client";
import { useParams } from "next/navigation";
import { PermissionEditor } from "@/components/admin/permission-editor";

export default function StaffAccessPage() {
  const { id } = useParams<{ id: string }>();
  return <PermissionEditor membershipId={id} />;
}
