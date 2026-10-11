"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSuperStore } from "@/store/super";
import { SuperShell } from "@/components/super/shell";
import { Loading } from "@/components/ui";

// The owner panel has its own login and token (easalpha.super), separate from the admin session.
export default function SuperLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSuperStore((s) => s.hydrated);
  const token = useSuperStore((s) => s.token);
  const onLogin = pathname === "/super/login";

  useEffect(() => { useSuperStore.persist.rehydrate(); }, []);
  useEffect(() => { if (hydrated && !token && !onLogin) router.replace("/super/login"); }, [hydrated, token, onLogin, router]);

  if (onLogin) return <>{children}</>;
  if (!hydrated || !token) return <Loading />;
  return <SuperShell>{children}</SuperShell>;
}
