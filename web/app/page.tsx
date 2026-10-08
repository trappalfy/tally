import { Hero } from "@/components/landing/hero";
import {
  Backed,
  BandDivider,
  Fees,
  ForProviders,
  HowItWorks,
  OneReceipt,
  QuarterlySeries,
} from "@/components/landing/sections";
import { Faq } from "@/components/landing/faq";

export default function Home() {
  return (
    <>
      <Hero />
      <OneReceipt />
      <HowItWorks />
      <BandDivider />
      <Backed />
      <QuarterlySeries />
      <Fees />
      <BandDivider />
      <ForProviders />
      <Faq />
    </>
  );
}
