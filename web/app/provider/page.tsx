import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { ProviderDesk } from "@/components/app/provider-desk";

export const metadata: Metadata = { title: "Provider desk" };

export default function ProviderDeskPage() {
  return (
    <PageShell eyebrow="FOR PROVIDERS" title="Provider desk" lead="Apply, list receipts, manage collateral and start jobs.">
      <Suspense fallback={<Loading />}>
        <ProviderDesk />
      </Suspense>
    </PageShell>
  );
}
