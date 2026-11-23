import { NextResponse } from "next/server"
import { type GeocodedCounties, toGeocodeAddress } from "@/lib/county-match"

export const maxDuration = 60

const BATCH_URL = "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch"
const MAX_ADDRESSES = 1000
const BATCH_SIZE = 500
const CACHE_LIMIT = 50_000

// Keyed by normalized address, so a street shared by several licenses is geocoded once.
// No-match results are cached too, so unresolvable addresses aren't retried on every search.
const cache = new Map<string, string | null>()

function remember(key: string, fips: string | null) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, fips)
}

const csvField = (value: string) => `"${value.replace(/["\r\n]/g, " ")}"`

async function geocodeBatch(addresses: { key: string; street: string; city: string; state: string; zip: string }[]) {
  const csv = addresses
    .map((a, i) => [String(i), csvField(a.street), csvField(a.city), a.state, a.zip].join(","))
    .join("\n")
  const form = new FormData()
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv")
  form.append("benchmark", "Public_AR_Current")
  form.append("vintage", "Current_Current")

  const response = await fetch(BATCH_URL, { method: "POST", body: form, signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Census Geocoder returned ${response.status}`)

  const results = new Map<string, string | null>()
  for (const line of (await response.text()).split("\n")) {
    const fields = line.match(/"([^"]*)"/g)?.map((f) => f.slice(1, -1))
    if (!fields) continue
    const address = addresses[Number(fields[0])]
    if (!address) continue
    const [stateFips, countyFips] = [fields[8], fields[9]]
    results.set(
      address.key,
      fields[2] === "Match" && /^\d{2}$/.test(stateFips ?? "") && /^\d{3}$/.test(countyFips ?? "")
        ? stateFips + countyFips
        : null,
    )
  }
  return results
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const input = (body as { addresses?: unknown })?.addresses
  if (!Array.isArray(input) || input.length > MAX_ADDRESSES) {
    return NextResponse.json({ error: `Send up to ${MAX_ADDRESSES} addresses` }, { status: 400 })
  }

  const unique = new Map<string, NonNullable<ReturnType<typeof toGeocodeAddress>>>()
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const { street, city, state, zip } = item as Record<string, unknown>
    if (![street, city, state, zip].every((v) => typeof v === "string" && v.length <= 120)) continue
    const address = toGeocodeAddress({
      street: street as string,
      city: city as string,
      state: state as string,
      zip: zip as string,
    })
    if (address) unique.set(address.key, address)
  }

  const results: GeocodedCounties = {}
  const pending: NonNullable<ReturnType<typeof toGeocodeAddress>>[] = []
  for (const [key, address] of unique) {
    if (cache.has(key)) results[key] = cache.get(key) ?? null
    else pending.push(address)
  }

  let failedBatches = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE)
    try {
      const batch = await geocodeBatch(chunk)
      for (const address of chunk) {
        const fips = batch.get(address.key) ?? null
        remember(address.key, fips)
        results[address.key] = fips
      }
    } catch (error) {
      // Leave these out (and uncached) so the client falls back to the city/ZIP heuristic.
      failedBatches++
      console.error("[county-geocode] batch failed:", error instanceof Error ? error.message : error)
    }
  }

  const values = Object.values(results)
  const summary = {
    requested: unique.size,
    cached: unique.size - pending.length,
    matched: values.filter(Boolean).length,
    unmatched: values.filter((v) => v === null).length,
    failed: unique.size - values.length,
  }
  if (pending.length > 0) console.info("[county-geocode]", JSON.stringify({ ...summary, failedBatches }))

  return NextResponse.json({ results, summary })
}
