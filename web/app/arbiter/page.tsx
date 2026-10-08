import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading } from "@/components/app/kit";
import { ArbiterDesk } from "@/components/app/arbiter-desk";

export const metadata: Metadata = { title: "Arbiter" };

export default function ArbiterPage() {
  return (
    <PageShell eyebrow="DISPUTES" title="Arbiter" lead="Open disputes and evidence. Visible to the arbiter address only.">
      <Suspense fallback={<Loading />}>
        <ArbiterDesk />
      </Suspense>
    </PageShell>
  );
}
