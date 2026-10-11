"use client";
// Help & Support box: the one place a staff member reaches EasAlpha's own support team (the product owner), reads
// EasAlpha's announcement, and where managers approve or deny a EasAlpha support-login request.
// Sidebar button + slide-over panel here; /admin/support (the notification link) lays the same sections out as a page.
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Clock, ExternalLink, Info, CircleHelp, Mail, MessageCircle, Phone, Send, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import type { PlatformInfo, SupportRequest, SupportRequestCategory, SupportSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { useAuthStore, useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Loading, Select, Sheet, Switch, Tabs, Textarea } from "@/components/ui";
import { HelpChat } from "@/components/admin/help-chat";
import { useAction } from "./crud";
import {
  CATEGORIES, categoryLabel, dismissAnnouncement, isAnnouncementDismissed, pendingSessionCount, readSeenIds, seenIdsAfterViewing,
  sessionStatusVariant, sortNewestFirst, supportStatusLabel, supportStatusVariant, unseenAnsweredCount, whatsappHref, whatsappMessage, writeSeenIds,
} from "./help-helpers";

// ---- Queries ----
export function usePlatform() {
  return useQuery({ queryKey: ["platform"], queryFn: () => api<PlatformInfo>("/platform", { auth: "none" }), staleTime: 5 * 60_000 });
}

function useSupportRequests(enabled = true) {
  return useQuery({
    queryKey: ["support_requests"],
    queryFn: () => api<{ data: SupportRequest[] }>("/support_requests", { auth: "admin" }),
    select: (r) => r.data,
    enabled,
    refetchInterval: 60_000,
  });
}

function useSupportSessions(enabled: boolean) {
  return useQuery({
    queryKey: ["support_sessions"],
    queryFn: () => api<{ data: SupportSession[] }>("/support_sessions", { auth: "admin" }),
    select: (r) => r.data,
    enabled,
    refetchInterval: 60_000,
  });
}

/** Answered-request ids the user has already opened; kept in localStorage and mirrored in the query cache so the badge updates. */
function useSeenIds() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["support_seen"], queryFn: () => readSeenIds(), staleTime: Infinity, gcTime: Infinity });
  const markSeen = (ids: string[]) => { writeSeenIds(ids); qc.setQueryData(["support_seen"], ids); };
  return { seen: q.data ?? [], markSeen };
}

/** What the orange badge on the sidebar button counts: unread answers, plus pending support-login requests for managers. */
export function useHelpBadge() {
  const session = useAuthStore((s) => s.session);
  const can = useCan();
  const canManage = can("settings.manage");
  const requests = useSupportRequests(!!session);
  const sessions = useSupportSessions(!!session && canManage);
  const { seen } = useSeenIds();
  const unseen = unseenAnsweredCount(requests.data, seen);
  const pending = canManage ? pendingSessionCount(sessions.data) : 0;
  return { unseen, pending, total: unseen + pending, canManage };
}

// ---- Entry point: a floating "Need help?" button, bottom right of every admin page ----
export function NeedHelpFab() {
  const [open, setOpen] = useState(false);
  const badge = useHelpBadge();
  const pathname = usePathname();
  if (pathname === "/admin/support") return null; // the page already shows everything the panel does
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Need help?"
        className="help-glow no-print fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-cta pl-3 pr-4 text-sm font-semibold text-cta-fg shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta sm:bottom-6 sm:right-6"
      >
        <CircleHelp className="h-5 w-5" strokeWidth={2} />
        <span>Need help?</span>
        {badge.total > 0 ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-cta-ink tabular"
            aria-label={`${badge.total} waiting for you`}
            title={[badge.unseen ? `${badge.unseen} new ${badge.unseen === 1 ? "reply" : "replies"} from EasAlpha` : null, badge.pending ? `${badge.pending} support access ${badge.pending === 1 ? "request" : "requests"} to approve` : null].filter(Boolean).join(" · ")}
          >
            {badge.total}
          </span>
        ) : null}
      </button>
      <HelpSupportPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The sidebar's last line: the product owner's powered-by text. */
export function PoweredBy({ className }: { className?: string }) {
  const platform = usePlatform();
  return (
    <div className={cn("truncate px-4 pb-3 text-center text-[11px] tracking-[0.4px] text-white/50", className)} title={platform.data?.version ? `Version ${platform.data.version}` : undefined}>
      {platform.data?.powered_by?.trim() || "Powered by EasAlpha"}
    </div>
  );
}

// ---- Announcement banner (above the admin content) ----
export function AnnouncementBanner({ className }: { className?: string }) {
  const platform = usePlatform();
  const text = platform.data?.announcement?.trim() || null;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { setHidden(isAnnouncementDismissed(text)); }, [text]);
  if (!text || hidden) return null;
  const warning = platform.data?.announcement_level === "warning";
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div role="status" className={cn("no-print mb-4 flex items-start gap-3 rounded-xl px-4 py-2.5 text-sm", warning ? "bg-warning-soft text-warning-ink" : "bg-info-soft text-info-ink", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 leading-5"><span className="font-semibold">{platform.data?.product_name || "EasAlpha"}:</span> {text}</p>
      <button onClick={() => { dismissAnnouncement(text); setHidden(true); }} className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-fg/8" aria-label="Dismiss announcement">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- Sections (shared by the panel and /admin/support) ----
function ContactRow({ icon: Icon, label, value, href, external }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; href?: string | null; external?: boolean }) {
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs tracking-[0.4px] text-fg-secondary">{label}</span>
        <span className="block truncate text-sm font-medium text-fg">{value}</span>
      </span>
      {href && external ? <ExternalLink className="h-4 w-4 shrink-0 text-fg-muted" /> : null}
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl px-2 py-2";
  if (!href) return <div className={cls}>{body}</div>;
  return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={cn(cls, "transition-colors hover:bg-fg/6")}>{body}</a>;
}

/** WhatsApp first (the CTA), then email, phone, hours and docs. Small print: powered-by and the version. */
export function ContactSection() {
  const platform = usePlatform();
  const business = useAuthStore((s) => s.session?.business.name);
  const p = platform.data;
  if (platform.isLoading) return <Loading />;
  if (!p) return <p className="text-sm text-fg-secondary">Could not load the support details. Try again in a moment.</p>;
  const wa = whatsappHref(p.support_whatsapp, whatsappMessage(p.product_name, business));
  const docs = p.docs_url || p.support_url;
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-secondary">The {p.product_name || "EasAlpha"} team answers questions about the product, your plan and anything that is not working.</p>
      {wa ? (
        <Button className="w-full" onClick={() => window.open(wa, "_blank", "noreferrer")}>
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </Button>
      ) : null}
      <div className="divide-y rounded-2xl border bg-card px-2 py-1">
        {p.support_whatsapp ? <ContactRow icon={MessageCircle} label="WhatsApp" value={p.support_whatsapp} href={wa} external /> : null}
        {p.support_email ? <ContactRow icon={Mail} label="Email" value={p.support_email} href={`mailto:${p.support_email}`} /> : null}
        {p.support_phone ? <ContactRow icon={Phone} label="Phone" value={p.support_phone} href={`tel:${p.support_phone.replace(/[^\d+]/g, "")}`} /> : null}
        {p.support_hours ? <ContactRow icon={Clock} label="Support hours" value={p.support_hours} /> : null}
        {docs ? <ContactRow icon={BookOpen} label={p.docs_url ? "Help articles" : "Support site"} value={docs.replace(/^https?:\/\//, "")} href={docs} external /> : null}
      </div>
      <p className="text-[11px] tracking-[0.4px] text-fg-muted">{p.powered_by?.trim() || "Powered by EasAlpha"} · Version {p.version}</p>
    </div>
  );
}

/** Ask EasAlpha: category, subject, message and (on by default) the page the user is on. */
export function AskForm({ onSent }: { onSent?: () => void }) {
  const pathname = usePathname();
  const [category, setCategory] = useState<SupportRequestCategory>("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachPage, setAttachPage] = useState(true);
  const send = useAction<{ subject: string; message: string; category: SupportRequestCategory; page: string | null }, SupportRequest>(
    ["support_requests"],
    (body) => api<SupportRequest>("/support_requests", { method: "POST", body, auth: "admin" }),
    "Sent to EasAlpha support",
  );
  const valid = subject.trim().length > 0 && subject.trim().length <= 200 && message.trim().length > 0 && message.trim().length <= 5000;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    send.mutate(
      { subject: subject.trim(), message: message.trim(), category, page: attachPage ? pathname : null },
      { onSuccess: () => { setSubject(""); setMessage(""); setCategory("question"); onSent?.(); } },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="What is it about?">
        <Select value={category} onChange={(e) => setCategory(e.target.value as SupportRequestCategory)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Subject" hint={`${subject.length}/200`}>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Kitchen printer prints blank pages" required />
      </Field>
      <Field label="Message" hint={`${message.length}/5000`}>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={5} placeholder="What happened, what you expected, and when it started." required />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch checked={attachPage} onChange={setAttachPage} label={`Attach this page (${pathname})`} />
        <Button type="submit" loading={send.isPending} disabled={!valid}><Send className="h-4 w-4" /> Send</Button>
      </div>
    </form>
  );
}

function RequestCard({ r }: { r: SupportRequest }) {
  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-heading">{r.subject}</div>
          <div className="mt-0.5 text-xs text-fg-secondary">
            {categoryLabel(r.category)} · {formatAgo(r.created_at)}{r.by?.name ? ` · ${r.by.name}` : ""}{r.page ? ` · ${r.page}` : ""}
          </div>
        </div>
        <Badge variant={supportStatusVariant(r.status)}>{supportStatusLabel(r.status)}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-fg">{r.message}</p>
      {r.reply ? (
        <div className="mt-3 rounded-xl bg-primary-soft px-3 py-2.5 text-sm text-primary-ink">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.4px]"><CircleHelp className="h-3.5 w-3.5" /> EasAlpha replied{r.replied_at ? ` · ${formatDateTime(r.replied_at)}` : ""}</div>
          <p className="whitespace-pre-wrap leading-5">{r.reply}</p>
        </div>
      ) : r.status === "open" ? (
        <p className="mt-2 text-xs text-fg-muted">Waiting for EasAlpha. You will get a notification when they reply.</p>
      ) : null}
    </li>
  );
}

/** My requests, newest first. Opening the list marks answered requests as seen so the sidebar badge clears. */
export function RequestList() {
  const q = useSupportRequests();
  const { seen, markSeen } = useSeenIds();
  const rows = useMemo(() => sortNewestFirst(q.data ?? []), [q.data]);
  useEffect(() => {
    if (!q.data?.length) return;
    const next = seenIdsAfterViewing(q.data, seen);
    if (next.length !== seen.length) markSeen(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the data changes; seen/markSeen are derived from the cache
  }, [q.data]);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <p className="text-sm text-danger">Could not load your requests.</p>;
  if (!rows.length) return <EmptyState icon={MessageCircle} title="No requests yet" hint="Anything you send to EasAlpha shows up here with their reply." />;
  return <ul className="space-y-3">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</ul>;
}

/** Support access: EasAlpha staff can only open this business after a manager approves, and every action is logged. */
export function SupportAccess() {
  const q = useSupportSessions(true);
  const [confirm, setConfirm] = useState<SupportSession | null>(null);
  const act = useAction<{ id: string; action: "approve" | "deny" }, SupportSession>(
    ["support_sessions"],
    ({ id, action }) => api<SupportSession>(`/support_sessions/${id}/${action}`, { method: "POST", auth: "admin" }),
  );
  const run = (s: SupportSession, action: "approve" | "deny") =>
    act.mutate({ id: s.id, action }, { onSuccess: () => { setConfirm(null); toast.success(action === "approve" ? "Access approved for one hour" : "Access denied"); } });
  const rows = useMemo(() => sortNewestFirst(q.data ?? []), [q.data]);
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm text-fg-secondary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>EasAlpha staff can only open this business after you approve a request here. Access lasts one hour and every action they take is written to the audit log.</span>
      </p>
      {q.isLoading ? <Loading /> : q.isError ? <p className="text-sm text-danger">Could not load support access requests.</p> : !rows.length ? (
        <EmptyState icon={ShieldCheck} title="No access requests" hint="When EasAlpha support asks to look at your account, the request appears here for you to approve or deny." />
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-heading">EasAlpha support asks for access</div>
                  <div className="mt-0.5 text-xs text-fg-secondary">{formatDateTime(s.created_at)}</div>
                </div>
                <Badge variant={sessionStatusVariant(s.status)}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-5 text-fg">{s.reason}</p>
              {s.status === "approved" && s.expires_at ? <p className="mt-2 text-xs text-fg-muted">Access until {formatDateTime(s.expires_at)}</p> : null}
              {s.status === "requested" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setConfirm(s)} disabled={act.isPending}>Approve for 1 hour</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(s, "deny")} disabled={act.isPending}>Deny</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && run(confirm, "approve")}
        title="Let EasAlpha support in?"
        description="They will be able to open this business as an owner for one hour. Everything they do is logged under Settings > Audit log."
        confirmLabel="Approve"
        loading={act.isPending}
      />
    </div>
  );
}

// ---- Slide-over panel ----
type PanelTab = "chat" | "contact" | "ask" | "requests" | "access";

export function HelpSupportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<PanelTab>("chat");
  const badge = useHelpBadge();
  const platform = usePlatform();
  useEffect(() => {
    // Open straight on what needs attention: a new reply, or a pending access request.
    if (!open) return;
    if (badge.unseen > 0) setTab("requests");
    else if (badge.pending > 0) setTab("access");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the panel opens
  }, [open]);
  const items: { value: PanelTab; label: string; count?: number }[] = [
    { value: "chat", label: "Chat" },
    { value: "contact", label: "Contact" },
    { value: "ask", label: "Ask EasAlpha" },
    { value: "requests", label: "My requests", count: badge.unseen || undefined },
    ...(badge.canManage ? [{ value: "access" as const, label: "Support access", count: badge.pending || undefined }] : []),
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Help & Support" description={`Reach the ${platform.data?.product_name || "EasAlpha"} team, follow your requests and control support access.`}>
      <Tabs value={tab} onChange={setTab} items={items} className="mb-4" />
      {tab === "chat" ? <HelpChat compact /> : null}
      {tab === "contact" ? <ContactSection /> : null}
      {tab === "ask" ? <AskForm onSent={() => setTab("requests")} /> : null}
      {tab === "requests" ? <RequestList /> : null}
      {tab === "access" && badge.canManage ? <SupportAccess /> : null}
    </Sheet>
  );
}
