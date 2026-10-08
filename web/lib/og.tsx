import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Tally — Time is money. So we put it on Tally.";

// The X banner (brand/banner) is the OG image, letterboxed to 1200x630.
// Its bottom-right corner reads "$TALLY · ROBINHOOD CHAIN"; the site must not mention
// the $TALLY token in v1 (brief section 11), so that corner is painted over.
const bannerData = await readFile(join(process.cwd(), "public/brand/tally-x-banner-1500x500.png"), "base64");
const bannerSrc = `data:image/png;base64,${bannerData}`;

export function renderOg() {
  const bannerH = 400; // 1500x500 scaled to 1200 wide
  const top = (OG_SIZE.height - bannerH) / 2;
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: "#050505" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bannerSrc} width={1200} height={bannerH} alt="" style={{ position: "absolute", left: 0, top }} />
        <div
          style={{ position: "absolute", left: 1000, top: top + 372, width: 200, height: 28, background: "#050505" }}
        />
      </div>
    ),
    OG_SIZE,
  );
}
