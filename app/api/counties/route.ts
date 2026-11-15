import { NextResponse } from "next/server"
import { US_STATES } from "@/lib/us-states"

// US Census 2020 ZCTA-to-county relationship file (pipe-delimited)
const CENSUS_REL_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"

interface CountyEntry {
  fips: string
  name: string
  zips: Set<string>
}

let countyIndexPromise: Promise<Map<string, CountyEntry>> | null = null

async function loadCountyIndex(): Promise<Map<string, CountyEntry>> {
  // The file is ~7 MB, beyond the fetch cache limit, so keep the parsed index in memory instead
  const response = await fetch(CENSUS_REL_URL, { cache: "no-store" })
  if (!response.ok) throw new Error(`Census data returned ${response.status}`)
  const text = await response.text()

  const index = new Map<string, CountyEntry>()
  const lines = text.split("\n")
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|")
    const zcta = cols[1]
    const countyFips = cols[9]
    const countyName = cols[10]
    if (!zcta || !countyFips || !countyName) continue

    let entry = index.get(countyFips)
    if (!entry) {
      entry = { fips: countyFips, name: countyName, zips: new Set() }
      index.set(countyFips, entry)
    }
    entry.zips.add(zcta)
  }
  return index
}

function getCountyIndex() {
  if (!countyIndexPromise) {
    countyIndexPromise = loadCountyIndex().catch((error) => {
      countyIndexPromise = null
      throw error
    })
  }
  return countyIndexPromise
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stateAbbr = searchParams.get("state")?.toUpperCase()
  const countiesParam = searchParams.get("counties")

  try {
    const index = await getCountyIndex()

    if (countiesParam) {
      const fipsList = countiesParam
        .split(",")
        .map((f) => f.trim())
        .filter((f) => /^\d{5}$/.test(f))
        .slice(0, 200)
      const zips = new Set<string>()
      for (const fips of fipsList) {
        index.get(fips)?.zips.forEach((z) => zips.add(z))
      }
      return NextResponse.json({ zips: Array.from(zips).sort() })
    }

    const state = US_STATES.find((s) => s.abbr === stateAbbr)
    if (!state) {
      return NextResponse.json({ error: "A valid state is required" }, { status: 400 })
    }

    const counties = Array.from(index.values())
      .filter((c) => c.fips.startsWith(state.fips))
      .map((c) => ({ fips: c.fips, name: c.name, zipCount: c.zips.size }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ state: state.abbr, counties })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load county data" },
      { status: 502 },
    )
  }
}
