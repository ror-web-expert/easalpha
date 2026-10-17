"use client";
// A client component: it hands the icon component to EmptyState, which a server component cannot pass across.
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

/** The admin's 404: keeps the sidebar and the top bar (the admin layout wraps it), says what happened and offers the
 *  way back. The page search (Ctrl K) finds any screen by name. */
export default function AdminNotFound() {
  return (
    <EmptyState icon={SearchX} title="This admin page does not exist" hint="The link may be old, or the page moved when the menu was reorganised. Press Ctrl K to search every screen by name."
      action={<Link href="/admin"><Button>Go to the dashboard</Button></Link>} />
  );
}
