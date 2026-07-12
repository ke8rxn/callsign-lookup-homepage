import { NextResponse } from "next/server"

// Extract the client's public IP from common proxy headers
function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    // x-forwarded-for may be a comma-separated list; the first is the client
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return null
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false
  // Ignore localhost / loopback / private ranges (won't geolocate)
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return false
  }
  // 172.16.0.0 - 172.31.255.255
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const second = Number.parseInt(m[1], 10)
    if (second >= 16 && second <= 31) return false
  }
  return true
}

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    // If we have a public IP use it; otherwise let the service infer from the request
    const target = ip && isPublicIp(ip) ? `https://ipapi.co/${ip}/json/` : "https://ipapi.co/json/"

    const response = await fetch(target, {
      headers: { "User-Agent": "callsign-lookup/1.0" },
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      throw new Error(`ipapi returned ${response.status}`)
    }

    const data = await response.json()

    const lat = typeof data.latitude === "number" ? data.latitude : Number.parseFloat(data.latitude)
    const lon = typeof data.longitude === "number" ? data.longitude : Number.parseFloat(data.longitude)

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: "Could not determine location from IP address." }, { status: 404 })
    }

    const cityParts = [data.city, data.region_code].filter(Boolean)
    const label = cityParts.length > 0 ? cityParts.join(", ") : "your approximate location"

    return NextResponse.json({ lat, lon, label })
  } catch (error) {
    console.log("[v0] ip-location lookup error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to look up IP location" },
      { status: 500 },
    )
  }
}
