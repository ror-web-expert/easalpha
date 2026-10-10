"use client";
import { PieChart } from "lucide-react";
import { KindStatementPage } from "@/components/admin/finance-statement";

export default function EquityPage() {
  return <KindStatementPage icon={PieChart} title="Equity" description="Owner's capital and drawings plus the profit earned so far, as of a day." path="equity" kindLabel="Equity" />;
}
