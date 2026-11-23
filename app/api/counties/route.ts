import { NextResponse } from "next/server"
import { US_STATES } from "@/lib/us-states"
import { type CountyMatcher, normalizePlaceName } from "@/lib/county-match"

// US Census 2020 ZCTA-to-county relationship file (pipe-delimited)
const CENSUS_REL_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"
// US Census 2020 place and county-subdivision (township) name files, used to map cities to counties
const CENSUS_PLACE_URLS = [
  "https://www2.census.gov/geo/docs/reference/codes2020/national_place_by_county2020.txt",
  "https://www2.census.gov/geo/docs/reference/codes2020/national_cousub2020.txt",
]

interface CountyEntry {
  fips: string
  name: string
  zips: Set<string>
}

interface CountyIndex {
  counties: Map<string, CountyEntry>
  /** ZIP -> county FIPS -> land area of that part */
  zipAreas: Map<string, Map<string, number>>
}

/** State FIPS -> normalized place name -> county FIPS set */
type PlaceIndex = Map<string, Map<string, Set<string>>>

let countyIndexPromise: Promise<CountyIndex> | null = null
let placeIndexPromise: Promise<PlaceIndex> | null = null

// These files are several MB each, beyond the fetch cache limit, so keep the parsed indexes in memory instead
async function fetchText(url: string) {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`Census data returned ${response.status}`)
  return response.text()
}

async function loadCountyIndex(): Promise<CountyIndex> {
  const lines = (await fetchText(CENSUS_REL_URL)).split("\n")
  const counties = new Map<string, CountyEntry>()
  const zipAreas = new Map<string, Map<string, number>>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|")
    const zcta = cols[1]
    const countyFips = cols[9]
    const countyName = cols[10]
    if (!zcta || !countyFips || !countyName) continue

    let entry = counties.get(countyFips)
    if (!entry) {
      entry = { fips: countyFips, name: countyName, zips: new Set() }
      counties.set(countyFips, entry)
    }
    entry.zips.add(zcta)

    let areas = zipAreas.get(zcta)
    if (!areas) {
      areas = new Map()
      zipAreas.set(zcta, areas)
    }
    areas.set(countyFips, Number(cols[16]) || 0)
  }
  return { counties, zipAreas }
}

async function loadPlaceIndex(): Promise<PlaceIndex> {
  const files = await Promise.all(CENSUS_PLACE_URLS.map(fetchText))
  const index: PlaceIndex = new Map()
  for (const text of files) {
    const lines = text.split("\n")
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("|")
      const stateFips = cols[1]
      const countyFips = cols[2]
      const placeName = cols[6]
      if (!stateFips || !countyFips || !placeName) continue
      const key = normalizePlaceName(placeName)
      if (!key) continue

      let statePlaces = index.get(stateFips)
      if (!statePlaces) {
        statePlaces = new Map()
        index.set(stateFips, statePlaces)
      }
      let fipsSet = statePlaces.get(key)
      if (!fipsSet) {
        fipsSet = new Set()
        statePlaces.set(key, fipsSet)
      }
      fipsSet.add(stateFips + countyFips)
    }
  }
  return index
}

function cached<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>) {
  let promise = get()
  if (!promise) {
    promise = load().catch((error) => {
      set(null)
      throw error
    })
    set(promise)
  }
  return promise
}

const getCountyIndex = () =>
  cached(() => countyIndexPromise, (p) => (countyIndexPromise = p), loadCountyIndex)
const getPlaceIndex = () =>
  cached(() => placeIndexPromise, (p) => (placeIndexPromise = p), loadPlaceIndex)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stateAbbr = searchParams.get("state")?.toUpperCase()
  const countiesParam = searchParams.get("counties")

  try {
    if (countiesParam) {
      const fipsList = countiesParam
        .split(",")
        .map((f) => f.trim())
        .filter((f) => /^\d{5}$/.test(f))
        .slice(0, 200)
      const state = US_STATES.find((s) => s.fips === fipsList[0]?.slice(0, 2))
      if (!state || fipsList.some((f) => !f.startsWith(state.fips))) {
        return NextResponse.json({ error: "Counties must all be in one state" }, { status: 400 })
      }

      const [{ counties, zipAreas }, places] = await Promise.all([getCountyIndex(), getPlaceIndex()])
      const selected = new Set(fipsList)

      const zips = new Set<string>()
      for (const fips of selected) counties.get(fips)?.zips.forEach((z) => zips.add(z))

      const zipShare: Record<string, number> = {}
      for (const zip of zips) {
        let total = 0
        let inside = 0
        for (const [fips, area] of zipAreas.get(zip) ?? []) {
          total += area
          if (selected.has(fips)) inside += area
        }
        zipShare[zip] = total > 0 ? Math.round((inside / total) * 1000) / 1000 : 1
      }

      const cities: Record<string, boolean> = {}
      const splitCities: string[] = []
      for (const [name, fipsSet] of places.get(state.fips) ?? []) {
        const placeCounties = Array.from(fipsSet)
        const inside = placeCounties.some((f) => selected.has(f))
        cities[name] = inside
        if (inside && placeCounties.some((f) => !selected.has(f))) splitCities.push(name)
      }

      const match: CountyMatcher = {
        state: state.abbr,
        counties: Array.from(selected),
        cities,
        splitCities,
        zipShare,
      }
      return NextResponse.json({ zips: Array.from(zips).sort(), match })
    }

    const state = US_STATES.find((s) => s.abbr === stateAbbr)
    if (!state) {
      return NextResponse.json({ error: "A valid state is required" }, { status: 400 })
    }

    // Warm the place index in the background so ZIP generation is fast later
    getPlaceIndex().catch(() => {})

    const { counties } = await getCountyIndex()
    const stateCounties = Array.from(counties.values())
      .filter((c) => c.fips.startsWith(state.fips))
      .map((c) => ({ fips: c.fips, name: c.name, zipCount: c.zips.size }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ state: state.abbr, counties: stateCounties })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load county data" },
      { status: 502 },
    )
  }
}
