import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { ProvidersList } from "@/components/app/providers-list";

export const metadata: Metadata = { title: "Providers" };

export default function ProvidersPage() {
  return (
    <PageShell eyebrow="PROVIDER REGISTER" title="Providers" lead="Approved GPU operators, their cards and their collateral. Track record read from the chain.">
      <Suspense fallback={<Loading />}>
        <ProvidersList />
      </Suspense>
    </PageShell>
  );
}
