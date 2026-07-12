import { NextResponse } from "next/server"

interface HearhamRepeater {
  id: number
  callsign: string
  latitude: number
  longitude: number
  city: string
  group: string
  internet_node: string
  mode: string
  encode: string
  decode: string
  frequency: number
  offset: number
  description: string
  power: string
  operational: number
  restriction: string
}

let repeaterCache: HearhamRepeater[] | null = null
let cacheTime = 0
const CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

async function getRepeaters(): Promise<HearhamRepeater[]> {
  const now = Date.now()
  if (repeaterCache && now - cacheTime < CACHE_TTL) {
    return repeaterCache
  }

  const response = await fetch("https://hearham.com/api/repeaters/v1", {
    next: { revalidate: 21600 }, // 6 hours
  })

  if (!response.ok) {
    throw new Error(`hearham API returned ${response.status}`)
  }

  const data = (await response.json()) as HearhamRepeater[]
  repeaterCache = data
  cacheTime = now
  return data
}

// Haversine distance in miles between two lat/lon points
function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latParam = searchParams.get("lat")
  const lonParam = searchParams.get("lon")
  const radiusParam = searchParams.get("radius")

  if (!latParam || !lonParam) {
    return NextResponse.json({ error: "Missing lat/lon parameters" }, { status: 400 })
  }

  const lat = Number.parseFloat(latParam)
  const lon = Number.parseFloat(lonParam)
  const radius = radiusParam ? Number.parseFloat(radiusParam) : 25

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "Invalid lat/lon values" }, { status: 400 })
  }

  try {
    const repeaters = await getRepeaters()

    const nearby = repeaters
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r) => ({
        ...r,
        distance: distanceMiles(lat, lon, r.latitude, r.longitude),
      }))
      .filter((r) => r.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 100)

    return NextResponse.json({ repeaters: nearby, count: nearby.length })
  } catch (error) {
    console.log("[v0] repeaters lookup error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch repeaters" },
      { status: 500 },
    )
  }
}
