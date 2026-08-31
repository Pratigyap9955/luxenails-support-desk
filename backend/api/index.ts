/**
 * Vercel serverless entry point for the LUXENAILS API.
 *
 * Vercel treats files in this `api/` directory as serverless functions. The
 * Express app is a valid `(req, res)` handler, so exporting it here makes the
 * whole API run as a single function. `vercel.json` rewrites every path to this
 * function; the app's own `/api/*` routing takes it from there.
 */
import { app } from "../src/app";

export default app;
