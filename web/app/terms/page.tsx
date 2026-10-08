import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { DocSection } from "@/components/prose";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the Tally site and app.",
};

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="TERMS"
      title="Terms of use"
      lead="Plain-English terms for using this site and app. Draft: subject to the owner's legal review."
    >
      <article className="max-w-[760px]">
        <DocSection id="scope" index="01" title="What this site is">
          <p>
            This site is an interface to smart contracts on Robinhood Chain. It does not hold your funds or your keys.
            Every action is a transaction you sign in your own wallet and is executed by the contracts, not by Tally.
          </p>
        </DocSection>

        <DocSection id="receipts" index="02" title="What a receipt is, and is not">
          <p>
            A receipt is a claim on compute time: one hour on the reference A100 80GB, or its benchmark equivalent on
            another card, delivered by an approved provider, or a USDG settlement at quarter end at the series
            reference price.
          </p>
          <p>
            Receipts are a claim on compute time, not a deposit or an investment. Tally makes no promise about the
            future price of a receipt, and nothing is paid for holding one.
          </p>
        </DocSection>

        <DocSection id="contracts" index="03" title="Contracts and disputes">
          <p>
            The contracts are open source and verified. They have not been externally audited. You use them at your
            own risk. Disputes are resolved by the Tally team multisig in v1, and its decisions are final on-chain.
          </p>
        </DocSection>

        <DocSection id="providers" index="04" title="Providers">
          <p>
            Providers are independent GPU operators approved by Tally. They are responsible for running the jobs they
            accept. Tally does not run the machines and does not see your job spec or access details in plain text.
          </p>
        </DocSection>

        <DocSection id="use" index="05" title="Your use">
          <p>
            You are responsible for your wallet, your keys, the jobs you run and complying with the laws that apply to
            you. Do not use the service to run unlawful workloads or to attack providers or other users.
          </p>
        </DocSection>

        <DocSection id="liability" index="06" title="No warranty">
          <p>
            The site and the contracts are provided as is, without warranty of any kind. To the extent the law allows,
            Tally is not liable for losses from smart contract bugs, provider failures, USDG freezes or pauses, network
            outages, price changes or your own mistakes. Read the{" "}
            <Link href="/risks" className="text-lime underline underline-offset-4">
              risks
            </Link>{" "}
            before you buy.
          </p>
        </DocSection>

        <DocSection id="changes" index="07" title="Changes">
          <p>
            These terms may change. Contract parameters that are fixed in code cannot change after deployment,
            whatever these terms say.
          </p>
        </DocSection>
      </article>
    </PageShell>
  );
}
