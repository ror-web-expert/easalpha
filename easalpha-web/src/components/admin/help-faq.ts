// The Help chat's standard questions: each has the words people use, a short answer and the screen to go to.
// Pure: matching is unit-tested in help-faq.test.ts. Anything unmatched is offered to EasAlpha support as a request.

export interface FaqEntry { id: string; question: string; keywords: string[]; answer: string; href?: string; link?: string }

export const FAQ: FaqEntry[] = [
  { id: "pair-till", question: "How do I pair a till or tablet?", keywords: ["pair", "till", "tablet", "device", "pairing", "code", "pos", "kds", "kitchen screen"],
    answer: "Open Settings, Signed-in devices, add a device and note its 6-digit pairing code. On the till open /pos/pair and type the code; the cashier then logs in with their PIN.", href: "/admin/settings/devices", link: "Signed-in devices" },
  { id: "add-product", question: "How do I add a product or deal?", keywords: ["product", "item", "menu", "deal", "category", "price", "variant", "modifier", "add"],
    answer: "Products, Catalog has the full form: name, category, price, variants and modifiers, image and tax. Deals and categories are next to it under Products.", href: "/admin/products/catalog", link: "Catalog" },
  { id: "branding", question: "How do I put my logo on receipts?", keywords: ["logo", "receipt", "branding", "header", "footer", "colour", "color", "favicon", "cover"],
    answer: "Settings, Branding holds the logo, the receipt header and footer, the footer QR and the storefront colours, with live previews. Tills pick the logo up on their next sync.", href: "/admin/settings/branding", link: "Branding" },
  { id: "day-close", question: "How do I close the day or a shift?", keywords: ["close", "day", "shift", "day-end", "day end", "settlement", "z report", "till report", "cash"],
    answer: "A cashier closes their shift from the POS shift page (My Till). The manager then runs Finance, Day Close; Day-End Settlement clears the tills' cash into company cash.", href: "/admin/finance/day-close", link: "Day Close" },
  { id: "printer", question: "My printer is not printing", keywords: ["print", "printer", "printing", "blank", "paper", "thermal", "usb", "print server"],
    answer: "Check the paper width in Branding (58 or 80 mm), then on the till open the printer settings and send a test page. The desktop app's print server must be running for USB printers; browser printing works for network printers.", href: "/admin/settings/branding", link: "Receipt branding" },
  { id: "whatsapp", question: "How do WhatsApp receipts work?", keywords: ["whatsapp", "receipt image", "statement", "send", "message", "template", "bulk"],
    answer: "Settings, WhatsApp: link a phone by scanning the QR code, turn on the master switch and auto-send. Templates carry the variables, and Send Logs shows every message.", href: "/admin/settings/whatsapp", link: "WhatsApp" },
  { id: "staff", question: "How do I add staff and PINs?", keywords: ["staff", "cashier", "manager", "pin", "employee", "user", "login", "permission", "role", "password"],
    answer: "Staff, Admin Staff adds people with a role and the permissions you tick; Cashiers and Order Takers get a PIN for the till. A forgotten PIN is reset from the same screen.", href: "/admin/staff/admin-staff", link: "Admin Staff" },
  { id: "plan", question: "How do I change my plan or pay an invoice?", keywords: ["plan", "billing", "invoice", "pay", "payment", "trial", "subscription", "upgrade", "price"],
    answer: "Settings, Plan shows your plan, the trial and every invoice. Choose a plan there and report a payment; EasAlpha confirms it and the account goes active.", href: "/admin/settings/plan", link: "Plan" },
  { id: "reports", question: "Where are the reports?", keywords: ["report", "sales", "grand", "export", "pdf", "csv", "profit", "cashier report"],
    answer: "Reports in the sidebar lists every report: Grand, Sales, Financial, Products, Cashiers, Customers and more. Each has CSV and PDF buttons.", href: "/admin/reports", link: "Reports" },
  { id: "stock", question: "Stock is not deducting", keywords: ["stock", "inventory", "deduct", "deduction", "recipe", "ingredient", "consumption", "warehouse"],
    answer: "Stock deducts when an order completes, from the product's recipe. Inventory Reports, Deduction Health shows what failed and lets you retry; make sure the product has a recipe and the section has stock.", href: "/admin/inventory-reports/deduction-health", link: "Deduction Health" },
  { id: "khata", question: "How does customer credit (khata) work?", keywords: ["khata", "credit", "udhaar", "ledger", "receivable", "customer balance", "account"],
    answer: "Pay an order with the Account method and it goes on the customer's khata. Customers, Ledger shows balances, Customer Payments takes money in, and AR Aging shows who is overdue.", href: "/admin/customers/ledger", link: "Customer Ledger" },
  { id: "website", question: "How do I set up online ordering?", keywords: ["website", "online", "storefront", "qr", "order online", "delivery", "store"],
    answer: "Settings, Website Config builds the storefront: identity, pages, delivery, contact and so on. Publish it and share /store/your-slug; customers add to a cart and order for delivery or pickup, and each order waits in Orders, Online & QR orders for a cashier to accept. QR ordering at tables is under Settings, QR ordering.", href: "/admin/settings/website", link: "Website Config" },
  { id: "hours", question: "How do I set business hours and the day window?", keywords: ["hours", "business day", "opening", "closing", "timing", "window", "06:01"],
    answer: "Settings, Business Hours sets opening hours per day and the business-day window (06:01 to 02:01 by default). Every daily report follows that window, not midnight.", href: "/admin/settings/business-hours", link: "Business Hours" },
  { id: "desktop", question: "How do I install the desktop app?", keywords: ["desktop", "install", "installer", "download", "windows", "exe", "appimage", "mac", "setup file", "application"],
    answer: "Open the Download page: it picks the installer for your computer (Windows, Linux or Mac) and lists the others. Install it, open it, and sign in once as a manager on the setup screen to make the machine a till, kitchen display or token screen. Tablets and phones just install the web app from the browser.", href: "/download", link: "Download" },
  { id: "offline", question: "Does the till work without internet?", keywords: ["offline", "internet", "load shedding", "sync", "connection", "wifi", "network"],
    answer: "Yes. The till keeps selling offline and syncs when the connection is back. Settings, Needs attention lists anything the server rejected during sync.", href: "/admin/settings/needs-attention", link: "Needs attention" },
];

const STOP = new Set(["how", "do", "i", "the", "a", "an", "my", "is", "to", "in", "on", "of", "can", "not", "it", "me", "we", "and", "or", "for", "with", "does", "what", "where", "why", "please", "help", "hi", "hello"]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
}

/** The best FAQ entry for a free-text question, or null when nothing scores. Keyword phrases match as substrings; words match stems loosely. */
export function matchFaq(text: string, faq: FaqEntry[] = FAQ): FaqEntry | null {
  const lower = text.toLowerCase();
  const words = tokens(text);
  if (!words.length) return null;
  let best: { entry: FaqEntry; score: number } | null = null;
  for (const entry of faq) {
    let score = 0;
    for (const k of entry.keywords) {
      if (k.includes(" ") || k.includes("-")) { if (lower.includes(k)) score += 3; continue; }
      if (words.some((w) => w === k || w.startsWith(k) || k.startsWith(w) && w.length >= 4)) score += 2;
    }
    if (words.some((w) => entry.id.includes(w))) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best && best.score >= 2 ? best.entry : null;
}

/** The chips shown at the start of a chat: the first n questions. */
export function quickQuestions(n = 6, faq: FaqEntry[] = FAQ): FaqEntry[] {
  return faq.slice(0, n);
}

/** Subject for a support request made from the chat: the first sentence, at most 80 characters. */
export function chatSubject(text: string): string {
  const first = text.trim().split(/[.?!\n]/)[0].trim() || text.trim();
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}...` : first;
}
