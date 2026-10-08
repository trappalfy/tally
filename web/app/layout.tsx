import type { Metadata, Viewport } from "next";
import "./globals.css";
import { departureMono, instrumentSerif, inter } from "./fonts";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Tally — Time is money. So we put it on Tally.",
    template: "%s · Tally",
  },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: "Tally",
    title: "Tally — Time is money. So we put it on Tally.",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Tally — Time is money. So we put it on Tally.",
    description: site.description,
    ...(site.xHandle ? { site: `@${site.xHandle}` } : {}),
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${departureMono.variable} ${inter.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink">
        <Providers>
          <a
            href="#main"
            className="stamp sr-only z-50 bg-lime px-3 py-2 text-xs text-lime-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
