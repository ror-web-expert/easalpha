"use client";
import { FileSpreadsheet } from "lucide-react";
import { KindStatementPage } from "@/components/admin/finance-statement";

export default function LiabilitiesPage() {
  return <KindStatementPage icon={FileSpreadsheet} title="Liabilities" description="What the business owes: supplier balances, customer deposits, taxes due and loans, as of a day." path="liabilities" kindLabel="Liabilities" />;
}
