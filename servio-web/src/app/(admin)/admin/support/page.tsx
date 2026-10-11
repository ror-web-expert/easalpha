"use client";
// Help & Support as a full page: the target of the "EasAlpha replied" notification link. Same sections as the
// sidebar panel (components/admin/help-support.tsx), laid out in two columns.
import { CircleHelp } from "lucide-react";
import { PageHeader } from "@/components/admin/page";
import { AskForm, ContactSection, RequestList, SupportAccess, usePlatform } from "@/components/admin/help-support";
import { HelpChat } from "@/components/admin/help-chat";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { useCan } from "@/store/auth";

export default function SupportPage() {
  const can = useCan();
  const platform = usePlatform();
  const product = platform.data?.product_name || "EasAlpha";
  return (
    <>
      <PageHeader icon={CircleHelp} title="Help & Support" description={`Reach the ${product} team, follow your requests and control who from ${product} may open this business.`} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="grid gap-4 self-start lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Contact {product}</CardTitle></CardHeader>
            <CardBody><ContactSection /></CardBody>
          </Card>
          {can("settings.manage") ? (
            <Card>
              <CardHeader><CardTitle>Support access</CardTitle></CardHeader>
              <CardBody><SupportAccess /></CardBody>
            </Card>
          ) : null}
        </div>
        <div className="grid gap-4 self-start lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Chat</CardTitle><span className="text-xs text-fg-muted">Standard questions answered now; the rest goes to {product}</span></CardHeader>
            <CardBody><HelpChat /></CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Ask {product}</CardTitle></CardHeader>
            <CardBody><AskForm /></CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
            <CardBody><RequestList /></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
