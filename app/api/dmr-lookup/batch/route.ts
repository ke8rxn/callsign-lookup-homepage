import { NextResponse } from "next/server"
import { lookupDmrIds } from "@/lib/dmr-directory"

const MAX_CALLSIGNS = 5000
const CALLSIGN_PATTERN = /^[A-Z0-9]{3,8}$/

function normalize(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : []
  return Array.from(
    new Set(
      list
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => CALLSIGN_PATTERN.test(c)),
    ),
  ).slice(0, MAX_CALLSIGNS)
}

async function respond(callsigns: string[]) {
  if (callsigns.length === 0) {
    return NextResponse.json({ error: "At least one valid callsign is required" }, { status: 400 })
  }
  try {
    return NextResponse.json({ dmrIds: await lookupDmrIds(callsigns) })
  } catch {
    return NextResponse.json({ error: "DMR directory is temporarily unavailable" }, { status: 503 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return respond(normalize(searchParams.get("callsigns") || ""))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  return respond(normalize(body?.callsigns))
}
