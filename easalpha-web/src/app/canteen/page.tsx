"use client";
import { KitchenGate } from "@/components/kitchen/auth";
import { CanteenKiosk } from "@/components/canteen/kiosk";

export default function CanteenKioskPage() {
  return <KitchenGate title="Canteen kiosk"><CanteenKiosk /></KitchenGate>;
}
