import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callsign = searchParams.get("callsign")

  if (!callsign) {
    return NextResponse.json(
      { error: "Callsign parameter is required" },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `https://radioid.net/api/dmr/user/?callsign=${encodeURIComponent(callsign.trim().toUpperCase())}`
    )

    if (!response.ok) {
      return NextResponse.json(
        { dmrId: null },
        { status: 200 }
      )
    }

    const data = await response.json()
    
    // Return only the first DMR ID if multiple exist
    if (data.results && data.results.length > 0) {
      return NextResponse.json({ dmrId: String(data.results[0].id) })
    }
    
    return NextResponse.json({ dmrId: null })
  } catch (error) {
    console.error("DMR lookup error:", error)
    return NextResponse.json({ dmrId: null })
  }
}
