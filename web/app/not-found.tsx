import { Button } from "@/components/ui/button";
import { Guilloche } from "@/components/ui/guilloche";
import { Rosette } from "@/components/ui/rosette";
import { SerialNumber } from "@/components/ui/serial-number";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="container-tally flex flex-1 flex-col items-start justify-center gap-8 py-20 md:flex-row md:items-center md:justify-between">
        <div>
          <SerialNumber value="TL 04 0000404 X" size="md" />
          <h1 className="mt-6 font-serif text-[56px] italic leading-[0.95] text-ink md:text-[88px]">
            No receipt here.
          </h1>
          <p className="stamp mt-5 text-[16px] text-lime md:text-[20px]">THIS PAGE WAS NEVER MINTED.</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button href="/" size="lg">
              BACK TO TALLY
            </Button>
            <Button href="/market" variant="secondary" size="lg">
              GO TO MARKET
            </Button>
          </div>
        </div>
        <Rosette value="404" unit="VOID" size={180} className="opacity-80" />
      </div>
      <Guilloche height={72} rules />
    </div>
  );
}
