"use client";
import { MonitorSmartphone } from "lucide-react";
import { SettingsGroupPage } from "@/components/admin/settings-screen";
import { ScannerTestCard } from "@/components/admin/scanner-test-card";

// SPEC Settings > Point of Sale: Order Taker, Customer Required, Customer Fields, Order Behavior, POS Notifications,
// KDS Alerts, Barcode Scanning, Pending Order Reminder, Receipt Branding, Print Server. Each is a card from the registry.
export default function PointOfSaleSettingsPage() {
  return <SettingsGroupPage group="point_of_sale" title="Point of Sale" icon={MonitorSmartphone} description="How the tills behave: customer rules, order flow, alerts, receipt branding and printing. Tills pick these up on the next sync." after={<ScannerTestCard />} />;
}
