"use client";
import { KitchenGate } from "@/components/kitchen/auth";
import { CanteenCounter } from "@/components/canteen/counter";

export default function CanteenCounterPage() {
  return <KitchenGate title="Canteen counter"><CanteenCounter /></KitchenGate>;
}
