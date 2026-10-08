import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { Market } from "@/components/app/market";

export const metadata: Metadata = { title: "Market" };

export default function MarketPage() {
  return (
    <PageShell eyebrow="BUY RECEIPTS" title="Market" lead="Listings from every provider, priced in USDG. Buy receipts. Hold. Send. Redeem for an hour.">
      <Suspense fallback={<Loading />}>
        <Market />
      </Suspense>
    </PageShell>
  );
}
