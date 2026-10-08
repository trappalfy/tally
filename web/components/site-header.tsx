"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { NAV_LINKS } from "@/lib/config";
import { Wordmark } from "./logo";
import { WalletButton } from "./wallet-button";

type Variant = "desktop" | "mobile";

function isActive(pathname: string | null, href: string) {
  return !!pathname && (pathname === href || pathname.startsWith(`${href}/`));
}

function NavList({ pathname, variant, onNavigate }: { pathname: string | null; variant: Variant; onNavigate?: () => void }) {
  if (variant === "desktop") {
    return (
      <>
        {NAV_LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`stamp px-3 py-2 text-[12px] transition-colors hover:text-lime ${active ? "text-lime" : "text-ink-2"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </>
    );
  }
  return (
    <ul className="container-tally py-2">
      {NAV_LINKS.map((l, i) => {
        const active = isActive(pathname, l.href);
        return (
          <li key={l.href} className="border-b border-ink-3 last:border-b-0">
            <Link
              href={l.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`stamp flex items-center justify-between py-4 text-[14px] ${active ? "text-lime" : "text-ink"}`}
            >
              <span>{l.label}</span>
              <span className="text-[11px] text-ink-3">0{i + 1}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname is runtime data under Cache Components; keep it behind Suspense so
// every route can still prerender its shell.
function ActiveNavList(props: { variant: Variant; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList pathname={pathname} {...props} />;
}

function Nav(props: { variant: Variant; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname={null} {...props} />}>
      <ActiveNavList {...props} />
    </Suspense>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-3 bg-paper/90 backdrop-blur-md">
      <div className="container-tally flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Tally home" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Nav variant="desktop" />
        </nav>

        <div className="flex items-center gap-2">
          <WalletButton />
          <button
            type="button"
            className="flex size-8 flex-col items-center justify-center gap-[5px] border border-ink-3 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`block h-px w-4 bg-ink transition-transform ${open ? "translate-y-[3px] rotate-45" : ""}`} />
            <span className={`block h-px w-4 bg-ink transition-transform ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-ink-3 bg-paper md:hidden">
          <Nav variant="mobile" onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </header>
  );
}
