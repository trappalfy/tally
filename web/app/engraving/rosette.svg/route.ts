import { rosetteSvg, svgResponse } from "@/lib/engraving";

// Prerendered at build time: no runtime data is read.
export async function GET() {
  return svgResponse(rosetteSvg());
}
