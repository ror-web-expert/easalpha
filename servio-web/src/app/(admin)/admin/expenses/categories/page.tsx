"use client";
import Link from "next/link";
import { Layers, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page";
import { ExpenseCategoriesManager } from "@/components/admin/expenses-categories";
import { Button } from "@/components/ui";

/** Kept as its own route; the same manager sits on the Categories tab of the Expenses screen (SPEC). */
export default function ExpenseCategoriesPage() {
  return (
    <>
      <PageHeader icon={Layers} title="Expense categories" description="Two levels: a category and its sub-categories. Reports group by the top level." actions={
        <Link href="/admin/expenses"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Expenses</Button></Link>
      } />
      <ExpenseCategoriesManager />
    </>
  );
}
