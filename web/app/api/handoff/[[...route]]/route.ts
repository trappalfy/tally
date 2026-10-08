import { handle } from "hono/vercel";
import { app } from "@tally/handoff";

export const GET = handle(app);
export const POST = handle(app);
