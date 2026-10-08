import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { Portfolio } from "@/components/app/portfolio";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <PageShell eyebrow="YOUR RECEIPTS" title="Portfolio" lead="Your receipts by series, valued at the reference price. Redeem for an hour, or settle at quarter end.">
      <Suspense fallback={<Loading />}>
        <Portfolio />
      </Suspense>
    </PageShell>
  );
}
