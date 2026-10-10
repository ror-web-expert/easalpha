"use client";
import { BarChart3 } from "lucide-react";
import { RidersReport } from "@/components/admin/riders-report";

export default function RiderReportsPage() {
  return <RidersReport icon={BarChart3} title="Rider Reports" description="Deliveries and charges per rider for the period: assigned against completed, failed, cash collected and minutes to deliver. The same report sits under Reports as Delivery Riders." />;
}
