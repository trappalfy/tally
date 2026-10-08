import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { RedeemWizard } from "@/components/app/redeem-wizard";
import { START_WINDOW } from "@/lib/config";

export const metadata: Metadata = { title: "Redeem" };

export default function RedeemPage() {
  return (
    <PageShell eyebrow="REDEEM FOR AN HOUR" title="Redeem" lead={`Pick a series, a card and a provider. The provider has ${START_WINDOW} to start.`}>
      <Suspense fallback={<Loading />}>
        <RedeemWizard />
      </Suspense>
    </PageShell>
  );
}
