import type { Metadata } from "next";
import { Suspense } from "react";
import { getAddress, isAddress } from "viem";
import { PageShell } from "@/components/page-shell";
import { Loading, Notice } from "@/components/app/kit";
import { ProviderProfile } from "@/components/app/provider-profile";

export const metadata: Metadata = { title: "Provider" };

async function View({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const a = decodeURIComponent(address);
  if (!isAddress(a, { strict: false })) return <Notice tone="danger">Not an address.</Notice>;
  return <ProviderProfile address={getAddress(a)} />;
}

export default function ProviderProfilePage({ params }: PageProps<"/providers/[address]">) {
  return (
    <PageShell eyebrow="PROVIDER" title="Provider" lead="Profile, benchmark, collateral, listings and history.">
      <Suspense fallback={<Loading />}>
        <View params={params} />
      </Suspense>
    </PageShell>
  );
}
