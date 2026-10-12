"use client";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, FileX2, RefreshCw } from "lucide-react";
import { api, API_URL, ApiError } from "@/lib/api";
import type { CustomerBill } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { BillDocument } from "@/components/admin/customer-accounts";
import { Loading } from "@/components/ui";

// Public bill at /bill/<token>: the link a customer (or their guardian) gets on WhatsApp. No login and no admin shell:
// like /store/<slug>, it sits outside the (admin) layout and calls the open /public/bills/:token endpoint with no
// token. The bill is rebuilt from the ledger each time, so it is always current. An expired or wrong link (404
// bill.link_invalid) gets a plain message instead of an error.

const API_ORIGIN = API_URL.replace(/\/api\/v1$/, "");

export default function PublicBillPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ["public_bill", token],
    queryFn: () => api<CustomerBill>(`/public/bills/${encodeURIComponent(token)}`, { auth: "none" }),
    enabled: !!token,
    retry: false,
  });
  const bill = q.data;
  useEffect(() => { if (bill) document.title = `Bill ${bill.number} · ${bill.business.name}`; }, [bill]);
  const invalid = q.error instanceof ApiError && q.error.status === 404;
  const pdfHref = bill ? `${API_ORIGIN}${bill.pdf_url ?? `/api/v1/public/bills/${encodeURIComponent(token)}/pdf`}?download=1` : "";
  const now = bill?.balance_now_minor;
  const cur = bill?.business.currency || "PKR";
  return (
    <main className="min-h-screen bg-page px-4 py-6 sm:py-10">
      <meta name="robots" content="noindex, nofollow" />
      <div className="mx-auto w-full max-w-xl">
        {q.isLoading ? <Loading label="Loading your bill" /> : invalid ? (
          <div className="rounded-2xl border bg-card px-6 py-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted"><FileX2 className="h-7 w-7 text-fg-muted" /></span>
            <h1 className="mt-4 text-[22px] font-semibold leading-7 text-heading">This bill link is not working</h1>
            <p className="mt-2 text-sm text-fg-secondary">The link has expired or is not complete. Bill links work for 120 days. Please ask the shop to send your bill again on WhatsApp.</p>
          </div>
        ) : q.error || !bill ? (
          <div className="rounded-2xl border bg-card px-6 py-10 text-center">
            <h1 className="text-[22px] font-semibold leading-7 text-heading">We could not load your bill</h1>
            <p className="mt-2 text-sm text-fg-secondary">Check your internet connection and try again.</p>
            <button type="button" onClick={() => q.refetch()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-primary px-6 text-sm font-medium text-primary hover:bg-primary-soft">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : (
          <>
            <BillDocument bill={bill} className="rounded-2xl border px-4 py-5 shadow-[var(--elev-1)] sm:px-6 sm:py-6" />
            {now !== undefined && now !== bill.closing_balance_minor ? (
              <p className="mt-3 rounded-xl border bg-card px-4 py-3 text-sm text-fg-secondary">
                Your balance today is <span className="font-semibold text-fg tabular">{now < 0 ? `${formatMoney(-now, cur)} in advance` : formatMoney(now, cur)}</span>, after purchases and payments since this bill.
              </p>
            ) : null}
            <a href={pdfHref} download className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-cta px-6 text-base font-semibold text-cta-fg hover:bg-cta-hover hover:shadow-[var(--elev-1)]">
              <Download className="h-5 w-5" /> Download PDF
            </a>
            <p className="mt-4 text-center text-xs text-fg-muted">This bill is made from {bill.business.name}&apos;s account book and is always up to date.</p>
          </>
        )}
      </div>
    </main>
  );
}
