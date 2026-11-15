import { NextResponse } from "next/server"

const MAX_CALLSIGNS = 50
const CONCURRENCY = 6
const CALLSIGN_PATTERN = /^[A-Z0-9]{3,8}$/

async function lookupDmrId(callsign: string): Promise<string | null> {
  try {
    const response = await fetch(`https://radioid.net/api/dmr/user/?callsign=${encodeURIComponent(callsign)}`, {
      next: { revalidate: 86400 },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.results?.length ? String(data.results[0].id) : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callsigns = Array.from(
    new Set(
      (searchParams.get("callsigns") || "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => CALLSIGN_PATTERN.test(c)),
    ),
  ).slice(0, MAX_CALLSIGNS)

  if (callsigns.length === 0) {
    return NextResponse.json({ error: "At least one valid callsign is required" }, { status: 400 })
  }

  const dmrIds: Record<string, string> = {}
  let next = 0
  // RadioID only accepts one callsign per request, so run a small worker pool.
  const workers = Array.from({ length: Math.min(CONCURRENCY, callsigns.length) }, async () => {
    while (next < callsigns.length) {
      const callsign = callsigns[next++]
      const id = await lookupDmrId(callsign)
      if (id) dmrIds[callsign] = id
    }
  })
  await Promise.all(workers)

  return NextResponse.json({ dmrIds })
}
