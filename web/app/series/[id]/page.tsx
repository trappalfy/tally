import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { Loading, Notice } from "@/components/app/kit";
import { SeriesDetail } from "@/components/app/series-detail";

export const metadata: Metadata = { title: "Series" };

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = decodeURIComponent(id).trim();
  const m = /^(\d{4})-?Q([1-4])$/i.exec(raw);
  const sid = /^\d+$/.test(raw) ? BigInt(raw) : m ? BigInt(m[1] + m[2]) : undefined;
  if (sid === undefined) return <Notice tone="danger">Unknown series.</Notice>;
  return <SeriesDetail id={sid} />;
}

export default function SeriesPage({ params }: PageProps<"/series/[id]">) {
  return (
    <PageShell eyebrow="SERIES" title="Series" lead="Phase, dates, receipts issued and in circulation, and the reference price.">
      <Suspense fallback={<Loading />}>
        <View params={params} />
      </Suspense>
    </PageShell>
  );
}
