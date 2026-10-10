"use client";
import { Bike } from "lucide-react";
import { RidersReport } from "@/components/admin/riders-report";

export default function DeliveryRidersReportPage() {
  return <RidersReport icon={Bike} title="Delivery Riders" description="Deliveries and charges per rider for the period: assigned against completed, failed, cash collected and minutes to deliver. Also reachable as Rider Reports under Riders." />;
}
