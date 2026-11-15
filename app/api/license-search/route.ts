import { NextResponse } from "next/server"

const API_BASE = "https://api.ke8rxnwx.net"
const MAX_RESULTS = 1000

type SearchType = "callsign" | "frn" | "name" | "zipcode"

const VALIDATORS: Record<SearchType, (value: string) => string | null> = {
  callsign: (v) => (/^[A-Za-z0-9]{3,7}$/.test(v) ? v.toLowerCase() : null),
  frn: (v) => (/^\d{1,10}$/.test(v) ? v.padStart(10, "0") : null),
  name: (v) => (/^[\p{L}\p{M}' .,-]{2,60}$/u.test(v) ? v : null),
  zipcode: (v) => (/^\d{5}$/.test(v) ? v : null),
}

function isSearchType(value: string | null): value is SearchType {
  return value !== null && value in VALIDATORS
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const rawQuery = (searchParams.get("q") || "").trim()

  if (!isSearchType(type)) {
    return NextResponse.json({ error: "Invalid search type" }, { status: 400 })
  }

  const query = VALIDATORS[type](rawQuery)
  if (!query) {
    return NextResponse.json({ error: `Invalid ${type} value: ${rawQuery}` }, { status: 400 })
  }

  try {
    const response = await fetch(`${API_BASE}/${type}/${encodeURIComponent(query)}`, {
      // Name searches can return very large payloads that exceed the fetch cache limit
      ...(type === "name" ? { cache: "no-store" as const } : { next: { revalidate: 3600 } }),
    })

    if (response.status === 404) {
      return NextResponse.json({ query: rawQuery, type, total: 0, truncated: false, results: [] })
    }
    if (!response.ok) {
      throw new Error(`Upstream API returned ${response.status}`)
    }

    const data = await response.json()
    // The zipcode endpoint wraps records in { results }; the others return a bare array
    const records: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []

    return NextResponse.json({
      query: rawQuery,
      type,
      total: records.length,
      truncated: records.length > MAX_RESULTS,
      results: records.slice(0, MAX_RESULTS),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 502 },
    )
  }
}
