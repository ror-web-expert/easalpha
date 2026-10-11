"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Send, Sparkles, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { SupportRequest } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { chatSubject, FAQ, matchFaq, quickQuestions, type FaqEntry } from "@/components/admin/help-faq";
import { whatsappHref, whatsappMessage } from "@/components/admin/help-helpers";
import { usePlatform } from "@/components/admin/help-support";

// Help chat: standard questions answered on the spot from help-faq.ts; anything else is handed to EasAlpha support as a
// request with one tap. The thread lives in this browser only (localStorage) so a reload keeps the conversation.

type Msg = { id: string; from: "you" | "servio"; text: string; href?: string; link?: string; offer?: string; at: number };
const KEY = "servio.help.chat";

function load(): Msg[] { try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Msg[]) : []; } catch { return []; } }
function save(msgs: Msg[]) { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-60))); } catch { /* storage unavailable */ } }
const mid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function HelpChat({ className, compact }: { className?: string; compact?: boolean }) {
  const platform = usePlatform();
  const product = platform.data?.product_name || "EasAlpha";
  const business = useAuthStore((s) => s.session?.business.name);
  const pathname = usePathname();
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { setMsgs(load()); setLoaded(true); }, []);
  useEffect(() => { if (loaded) save(msgs); bottom.current?.scrollIntoView({ block: "end" }); }, [msgs, loaded]);
  const chips = useMemo(() => quickQuestions(compact ? 5 : 8), [compact]);
  const wa = whatsappHref(platform.data?.support_whatsapp, whatsappMessage(product, business));

  const push = (m: Omit<Msg, "id" | "at">) => setMsgs((list) => [...list, { ...m, id: mid(), at: Date.now() }]);
  const answer = (entry: FaqEntry | null, asked: string) => {
    if (entry) push({ from: "servio", text: entry.answer, href: entry.href, link: entry.link });
    else push({ from: "servio", text: `I do not have a ready answer for that. Send it to the ${product} team and they will reply here in My requests and by notification.`, offer: asked });
  };
  const ask = (q: string) => {
    const t = q.trim(); if (!t) return;
    push({ from: "you", text: t });
    setText("");
    answer(matchFaq(t), t);
  };
  const sendToEasAlpha = async (asked: string) => {
    setSending(asked);
    try {
      await api<SupportRequest>("/support_requests", { method: "POST", auth: "admin", body: { subject: chatSubject(asked), message: asked, category: "question", page: pathname } });
      qc.invalidateQueries({ queryKey: ["support_requests"] });
      setMsgs((list) => list.map((m) => (m.offer === asked ? { ...m, offer: undefined } : m)));
      push({ from: "servio", text: `Sent to the ${product} team. You will get a notification when they reply; the thread is under My requests.` });
    } catch (e) { push({ from: "servio", text: `Could not send: ${errorMessage(e)}` }); }
    finally { setSending(null); }
  };

  return (
    <div className={cn("flex flex-col rounded-2xl border bg-card", compact ? "h-[min(62vh,560px)]" : "h-[560px]", className)}>
      <div className={cn("flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin", compact ? "" : "p-4")}>
        <Bubble from="servio">
          <p>Salam! I am the {product} helper. Tap a question or type your own. Anything I cannot answer goes straight to the {product} team.</p>
        </Bubble>
        {msgs.length === 0 ? (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {chips.map((f) => <button key={f.id} type="button" onClick={() => ask(f.question)} className="rounded-full border bg-page px-3 py-1.5 text-left text-xs font-medium text-fg transition-colors hover:border-cta hover:text-cta-ink">{f.question}</button>)}
          </div>
        ) : null}
        {msgs.map((m) => (
          <Bubble key={m.id} from={m.from}>
            <p className="whitespace-pre-line">{m.text}</p>
            {m.href ? <Link href={m.href} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open {m.link} <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
            {m.offer ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => sendToEasAlpha(m.offer!)} loading={sending === m.offer}><Send className="h-3.5 w-3.5" /> Send to {product}</Button>
                {wa ? <Button size="sm" variant="secondary" onClick={() => window.open(wa, "_blank", "noreferrer")}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp instead</Button> : null}
              </div>
            ) : null}
          </Bubble>
        ))}
        {msgs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {FAQ.filter((f) => !msgs.some((m) => m.from === "you" && m.text === f.question)).slice(0, 3).map((f) => <button key={f.id} type="button" onClick={() => ask(f.question)} className="rounded-full border bg-page px-2.5 py-1 text-[11px] font-medium text-fg-secondary transition-colors hover:border-cta hover:text-cta-ink">{f.question}</button>)}
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 border-t p-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question…" aria-label="Your question" className="h-10" maxLength={1000} />
        <Button type="submit" disabled={!text.trim()} aria-label="Ask"><Send className="h-4 w-4" /></Button>
        {msgs.length ? <Button type="button" variant="ghost" size="sm" onClick={() => setMsgs([])} aria-label="Clear chat" title="Clear chat"><Trash2 className="h-4 w-4" /></Button> : null}
      </form>
    </div>
  );
}

function Bubble({ from, children }: { from: "you" | "servio"; children: React.ReactNode }) {
  const you = from === "you";
  return (
    <div className={cn("flex items-end gap-2", you && "flex-row-reverse")}>
      {you ? null : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cta text-cta-fg"><Sparkles className="h-3.5 w-3.5" /></span>}
      <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5", you ? "rounded-br-sm bg-primary text-primary-fg" : "rounded-bl-sm bg-page text-fg")}>{children}</div>
    </div>
  );
}
