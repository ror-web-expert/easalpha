import { redirect } from "next/navigation";

// Staff has no landing page of its own; the first SPEC population screen is Admin Staff.
export default function StaffIndexPage() {
  redirect("/admin/staff/admin-staff");
}
