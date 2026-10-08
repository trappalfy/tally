import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading, Notice } from "@/components/app/kit";
import { RedemptionView } from "@/components/app/redemption-view";

export const metadata: Metadata = { title: "Redemption" };

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return <Notice tone="danger">Unknown redemption.</Notice>;
  return <RedemptionView id={BigInt(id)} />;
}

export default function RedemptionPage({ params }: PageProps<"/redemptions/[id]">) {
  return (
    <PageShell
      eyebrow="REDEMPTION"
      title="Redemption"
      lead="Requested, started, running, dispute window, closed. Anyone can claim the payout once the start window has passed."
    >
      <Suspense fallback={<Loading />}>
        <View params={params} />
      </Suspense>
    </PageShell>
  );
}
