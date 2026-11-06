import { hasPermission } from "@/store/auth";

/**
 * What GET /reports/dashboard/all asks (reports_controller.rb): a report code, and one of the dashboard's. Kept out of
 * the page file: Next.js allows a page module to export only the page and its config.
 */
export function canReadDashboard(perms: string[] | undefined): boolean {
  return hasPermission(perms, "reports.view_all", "reports.view_branch", "reports.view_own") && hasPermission(perms, "reports.view_all", "reports.view_branch", "DASHBOARD", "VIEW_DAILY_SALES");
}
