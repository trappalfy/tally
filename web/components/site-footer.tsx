import Link from "next/link";
import { site, SERIAL_PREFIX } from "@/lib/config";
import { Guilloche } from "./ui/guilloche";
import { Wordmark } from "./logo";

const LINKS = [
  { href: "/market", label: "Market" },
  { href: "/providers", label: "Providers" },
  { href: "/docs", label: "Docs" },
  { href: "/risks", label: "Risks" },
  { href: "/terms", label: "Terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-ink-3">
      <Guilloche height={40} animate={false} opacity={0.7} />
      <div className="container-tally border-t border-ink-3 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <Link href="/" aria-label="Tally home" className="self-start">
            <Wordmark />
          </Link>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="stamp text-[12px] text-ink-2 hover:text-lime">
                    {l.label}
                  </Link>
                </li>
              ))}
              {site.xUrl && (
                <li>
                  <a
                    href={site.xUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stamp text-[12px] text-ink-2 hover:text-lime"
                  >
                    X
                  </a>
                </li>
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-ink-3 pt-6 md:flex-row md:items-end md:justify-between">
          <p className="stamp text-[13px] text-lime">{SERIAL_PREFIX} · 1 RECEIPT = 1 NCU</p>
          <p className="max-w-[560px] text-[12px] leading-relaxed text-ink-2">
            Receipts are a claim on compute time, not a deposit or an investment. Contracts are open source and
            verified. They have not been externally audited.
          </p>
        </div>
      </div>
    </footer>
  );
}
