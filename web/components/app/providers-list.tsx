"use client";

import Link from "next/link";
import { useMemo } from "react";
import { maskToIds, seriesLabel, Phase } from "@tally/shared";
import { Stamp } from "@/components/ui";
import { HealthBar } from "@/components/ui/health-bar";
import { Empty, Loading, NotDeployed, crPercent } from "./kit";
import { useProviders, useAllSeries, useHealths, useGpuTypes } from "@/lib/tally/hooks";
import { HUB_READY } from "@/lib/tally/contracts";
import { providerName, providerStats, useHubLogs, StatsGrid } from "./shared";

export function siteHref(site?: string) {
  if (!site) return undefined;
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export function ProvidersList() {
  const { providers, isLoading } = useProviders();
  const { series } = useAllSeries();
  const { types } = useGpuTypes();
  const logs = useHubLogs();
  const approved = providers.filter((p) => p.approved);
  const active = series.filter((s) => s.phase === Phase.Open || s.phase === Phase.Closing);
  const pairs = approved.flatMap((p) => active.map((s) => ({ provider: p.address, series: s.id })));
  const healths = useHealths(pairs);
  const stats = useMemo(() => (logs.data ? providerStats(logs.data) : undefined), [logs.data]);

  if (!HUB_READY) return <NotDeployed />;
  if (isLoading) return <Loading />;
  if (approved.length === 0) return <Empty>No approved providers yet</Empty>;

  return (
    <div className="space-y-4">
      {approved.map((p) => {
        const gpus = maskToIds(p.gpuMask ?? 0n).map((id) => types.find((t) => t.id === id)?.name ?? `GPU ${id}`);
        const href = siteHref(p.meta.site);
        return (
          <div key={p.address} className="border border-ink-3 p-[3px]">
            <div className="space-y-4 border border-ink-3 p-4 md:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/providers/${p.address}`} className="block truncate font-serif text-[28px] leading-tight hover:text-lime">
                    {providerName(p)}
                  </Link>
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="break-all text-[13px] text-ink-2 underline decoration-ink-3 underline-offset-4 hover:text-lime">
                      {p.meta.site}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.suspended && (
                    <Stamp boxed tone="danger" size="xs">
                      SUSPENDED
                    </Stamp>
                  )}
                  {gpus.length === 0 ? (
                    <Stamp boxed tone="muted" size="xs">
                      NO GPU SET
                    </Stamp>
                  ) : (
                    gpus.map((g) => (
                      <Stamp key={g} boxed tone="muted" size="xs">
                        {g}
                      </Stamp>
                    ))
                  )}
                </div>
              </div>

              {active.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {active.map((s) => {
                    const h = healths.get(p.address, s.id);
                    const cr = crPercent(h?.crBps);
                    return (
                      <div key={s.id.toString()} className="border border-ink-3 px-3 py-2.5">
                        <div className="stamp mb-2 flex flex-wrap justify-between gap-2 text-[11px]">
                          <span className="text-ink-2">{seriesLabel(s.id)}</span>
                          <span className="text-ink">{(h?.outstanding ?? 0n).toString()} NCU OUT</span>
                          <span className={h?.flagged ? "text-danger" : "text-ink-2"}>
                            {cr === null ? "—" : `CR ${cr.toFixed(0)}%`}
                            {h?.flagged && " · FLAGGED"}
                          </span>
                        </div>
                        <HealthBar value={cr} compact />
                      </div>
                    );
                  })}
                </div>
              )}

              <StatsGrid stats={stats?.get(p.address.toLowerCase())} loading={logs.isLoading} />
            </div>
          </div>
        );
      })}
      {logs.error && <p className="stamp text-[11px] text-ink-3">TRACK RECORD UNAVAILABLE: COULD NOT READ EVENTS.</p>}
    </div>
  );
}
