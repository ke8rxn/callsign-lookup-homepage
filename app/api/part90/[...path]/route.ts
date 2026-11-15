import { NextResponse, type NextRequest } from "next/server"

const UPSTREAM = "https://api.ke8rxnwx.net/part90"

// Allowed endpoints and how many path segments each takes after its name.
const ENDPOINTS: Record<string, number> = {
  meta: 0,
  callsign: 1,
  frn: 1,
  name: 1,
  frequency: 1,
  frequencies: 0,
  county: 2,
  city: 2,
  search: 0,
}

const ALLOWED_PARAMS = new Set([
  "callsign",
  "frn",
  "name",
  "service",
  "state",
  "county",
  "city",
  "zip",
  "frequency",
  "frequency_min",
  "frequency_max",
  "min",
  "max",
  "station_class",
  "limit",
  "offset",
])

const MAX_LIMIT = 100

function friendlyError(status: number, detail: unknown): string {
  const text = typeof detail === "string" ? detail : ""
  if (status === 404) return "No active IG/YG licenses were found for this search."
  if (/at least 3 characters/i.test(text)) return "Business name searches need at least 3 characters."
  if (/exceed 10 MHz/i.test(text)) return "Frequency ranges may not exceed 10 MHz."
  if (/county/i.test(text) && /state/i.test(text)) return "County searches require a state."
  if (/city/i.test(text) && /state/i.test(text)) return "City searches require a state."
  if (/frn/i.test(text)) return "FRNs must contain exactly 10 digits."
  if (status >= 400 && status < 500) return "That search couldn't be run. Check the criteria and try again."
  return "The Part 90 database is temporarily unavailable. Please try again in a few minutes."
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const [endpoint, ...segments] = path

  if (!Object.hasOwn(ENDPOINTS, endpoint) || segments.length !== ENDPOINTS[endpoint]) {
    return NextResponse.json({ error: "Unknown Part 90 endpoint." }, { status: 404 })
  }
  if (segments.some((s) => !s.trim() || s.length > 100)) {
    return NextResponse.json({ error: "That search couldn't be run. Check the criteria and try again." }, { status: 400 })
  }

  const upstreamParams = new URLSearchParams()
  for (const [key, value] of request.nextUrl.searchParams) {
    if (!ALLOWED_PARAMS.has(key) || value.length > 100) continue
    if (key === "limit") {
      const n = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(value, 10) || 50))
      upstreamParams.set(key, String(n))
    } else if (key === "offset") {
      upstreamParams.set(key, String(Math.max(0, Number.parseInt(value, 10) || 0)))
    } else {
      upstreamParams.set(key, value)
    }
  }

  const pathname = [endpoint, ...segments.map((s) => encodeURIComponent(s))].join("/")
  const qs = upstreamParams.toString()
  const url = `${UPSTREAM}/${pathname}${qs ? `?${qs}` : ""}`

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: endpoint === "meta" ? 3600 : 900 },
      signal: AbortSignal.timeout(15000),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const status = res.status === 404 ? 404 : res.status >= 400 && res.status < 500 ? 400 : 502
      return NextResponse.json({ error: friendlyError(res.status, body?.detail) }, { status })
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    })
  } catch {
    return NextResponse.json(
      { error: "The Part 90 database is temporarily unavailable. Please try again in a few minutes." },
      { status: 502 },
    )
  }
}
