"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { AdminShell } from "@/components/admin/sidebar";
import { Loading } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  useEffect(() => { if (hydrated && !session) router.replace("/login"); }, [hydrated, session, router]);
  if (!hydrated || !session) return <Loading />;
  return <AdminShell>{children}</AdminShell>;
}
