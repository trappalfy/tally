import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Guilloche } from "@/components/ui/guilloche";
import { Rosette } from "@/components/ui/rosette";
import { SerialNumber } from "@/components/ui/serial-number";
import { EXAMPLE_SERIES, SERIAL } from "@/lib/config";

const fadeMask =
  "radial-gradient(ellipse 60% 62% at 50% 46%, #000 52%, transparent 100%)";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Franklin watermark. Desktop: right column, 30%. Below lg: under the text, 20%. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bottom-[132px] select-none">
        <div className="container-tally relative h-full">
          <div className="absolute inset-y-0 right-0 flex w-full justify-center opacity-20 lg:w-[46%] lg:justify-end lg:opacity-30">
            <Image
              src="/brand/franklin-engraving.png"
              alt=""
              width={825}
              height={1024}
              priority
              sizes="(min-width: 1024px) 560px, 90vw"
              className="h-full w-auto max-w-none object-contain object-bottom mix-blend-screen grayscale"
              style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
            />
          </div>
        </div>
      </div>

      <div className="container-tally relative">
        {/* rosette, top-right corner like the X banner */}
        <div className="absolute right-[var(--gutter)] top-6 md:top-10">
          <div className="md:hidden">
            <Rosette value="1" unit="NCU" size={80} />
          </div>
          <div className="hidden md:block">
            <Rosette value="1" unit="NCU" size={120} />
          </div>
        </div>

        <div className="relative grid grid-cols-12 pb-16 pt-14 md:pb-20 md:pt-20 lg:min-h-[600px] lg:pb-24">
          <div className="col-span-12 lg:col-span-7">
            <SerialNumber value={SERIAL} typing size="md" />

            <h1
              id="hero-title"
              className="mt-8 font-serif text-[64px] italic leading-[0.9] tracking-[-0.015em] text-ink xs:text-[72px] md:mt-10 md:text-[112px] xl:text-[128px]"
            >
              Time is money.
            </h1>
            <p className="stamp mt-5 text-[12px] text-ink-2 md:text-[14px]">— B. FRANKLIN, 1748</p>
            <p className="stamp mt-6 text-[22px] leading-tight text-lime md:text-[32px]">SO WE PUT IT ON TALLY.</p>

            <p className="mt-8 max-w-[540px] font-serif text-[20px] leading-snug text-ink md:text-[24px]">
              A Tally receipt is good for one hour of GPU compute. Buy at today&apos;s price. Redeem when you need the
              machine, or sell to someone who does.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button href="/market" size="lg">
                BUY RECEIPTS
              </Button>
              <Button href="#how" variant="secondary" size="lg">
                HOW IT WORKS
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* full-width layered guilloche band with the second serial */}
      <div className="relative">
        <div className="relative border-y border-ink-3">
          <Guilloche height={96} />
          <div className="absolute inset-0">
            <Guilloche height={96} reverse flip opacity={0.45} />
          </div>
        </div>
        <div className="container-tally flex items-center justify-between py-3">
          <span className="stamp hidden text-[11px] text-ink-3 md:inline">SERIES {EXAMPLE_SERIES} · 1 RECEIPT = 1 NCU</span>
          <SerialNumber value={SERIAL} size="sm" className="mx-auto md:mx-0" />
        </div>
      </div>
    </section>
  );
}
