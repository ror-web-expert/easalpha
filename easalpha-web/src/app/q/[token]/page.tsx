"use client";
import { useParams } from "next/navigation";
import { QrGuestPage } from "@/components/qr/qr-guest";

// The page a guest lands on after scanning a table card: /q/<table token>. Public, no login; the token names the
// table and its business (GET /api/v1/qr/:token). Printed cards come from Settings, QR ordering.

export default function QrPage() {
  const { token } = useParams<{ token: string }>();
  return <QrGuestPage token={token} />;
}
