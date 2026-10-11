"use client";
import { Percent } from "lucide-react";
import { SettingsGroupPage } from "@/components/admin/settings-screen";

// SPEC Settings > Charges & Tax: Service Charge, Delivery Charge, PRA e-IMS.
export default function ChargesTaxSettingsPage() {
  return <SettingsGroupPage group="charges_tax" title="Charges & Tax" icon={Percent} description="Default service and delivery charges pre-filled on the POS, cash rounding, and the PRA e-IMS registration used for tax invoices." />;
}
