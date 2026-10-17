import { notFound } from "next/navigation";

// Any /admin address with no page renders the admin's own 404 (not-found.tsx beside the admin pages), inside the
// sidebar and top bar, instead of the public site's page with its Start free button (review 5.1).
export default function MissingAdminPage() {
  notFound();
}
