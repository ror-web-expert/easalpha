import { TRIAL_DAYS } from "./site-helpers";

/** The homepage FAQ. The accordion and the FAQPage schema both read this list, so the visible text and the
 *  structured data can never drift apart. Keep answers as plain strings for that reason. */
export const HOME_FAQ: { q: string; a: string }[] = [
  { q: "Does EasAlpha really work offline?", a: "Yes. The till keeps a local copy of the menu and queues orders, payments and receipts while the connection is down. When the internet returns everything syncs in order, and anything the server rejects shows up in a Needs Attention list so nothing is lost silently." },
  { q: "What do I need to run it?", a: "Any Windows or Linux PC for the till, a thermal receipt printer (58 or 80 mm), and Android tablets or phones for the order-taker, kitchen display and rider app. The admin panel runs in any browser. Nothing to install on a server; we host it." },
  { q: "How long does setup take?", a: "Most single-branch restaurants are selling the same day. Import your menu from a spreadsheet, pair your till with a code, and follow the setup checklist. Recipes and stock can be added later without stopping sales." },
  { q: "Can I move from my current POS?", a: "You can import products, categories and customers from CSV. If you are on another system today, contact us and we will help map the export." },
  { q: "Is my data mine?", a: "Yes. Every report exports to CSV and PDF, customers and products download as spreadsheets, and we delete your account's data on request. See the privacy policy." },
  { q: "What does the free trial include?", a: `Every feature of the plan you choose for ${TRIAL_DAYS} days, with no card required. At the end you pick a plan and pay by card or bank transfer, or JazzCash and EasyPaisa in Pakistan.` },
];
