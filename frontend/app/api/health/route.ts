/**
 * PRISM Demo-mode /api/health route — Vercel serverless fallback.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "demo",
    evaluator_sha: "937202df",
    mode: "vercel-serverless",
    models_available: 10,
  });
}
