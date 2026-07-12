"use client"

import { useState, useCallback, useMemo } from "react"
import { MapPin, Loader2, Radio, Navigation, Download, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Repeater {
  id: number
  callsign: string
  latitude: number
  longitude: number
  city: string
  group: string
  mode: string
  encode: string
  decode: string
  frequency: number
  offset: number
  operational: number
  distance: number
  description: string
}

type SortKey = "callsign" | "frequency" | "offset" | "tone" | "mode" | "distance"
type SortDir = "asc" | "desc"

// Convert a Maidenhead grid square (4 or 6 characters) to its center lat/lon
function gridToLatLon(grid: string): { lat: number; lon: number } | null {
  const g = grid.trim().toUpperCase()
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(g)) return null

  const A = "A".charCodeAt(0)
  let lon = (g.charCodeAt(0) - A) * 20 - 180
  let lat = (g.charCodeAt(1) - A) * 10 - 90
  lon += Number.parseInt(g[2], 10) * 2
  lat += Number.parseInt(g[3], 10) * 1

  if (g.length === 6) {
    lon += (g.charCodeAt(4) - A) * (2 / 24)
    lat += (g.charCodeAt(5) - A) * (1 / 24)
    lon += 2 / 24 / 2
    lat += 1 / 24 / 2
  } else {
    lon += 1
    lat += 0.5
  }

  return { lat, lon }
}

function formatFrequency(hz: number): string {
  return (hz / 1_000_000).toFixed(4)
}

function formatOffset(hz: number): string {
  if (!hz) return "Simplex"
  const mhz = hz / 1_000_000
  const sign = mhz > 0 ? "+" : ""
  return `${sign}${mhz.toFixed(3)} MHz`
}

// Parse DMR timeslots (TS1/TS2) referenced in a repeater's free-text description
function parseTimeslots(description: string): string[] {
  if (!description) return []
  const found = new Set<string>()
  const re = /(?:time\s*slot|timeslot|slot|ts)\s*#?\s*([12])/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(description)) !== null) {
    found.add(`TS${match[1]}`)
  }
  return Array.from(found).sort()
}

// Returns the access tone (CTCSS/DCS), or for DMR the color code plus timeslot(s)
// (e.g. "CC1/TS1"), or "N/A" when there isn't one (e.g. YSF/digital)
function formatTone(r: Repeater): string {
  const isDMR = /DMR/i.test(r.mode || "")
  if (isDMR) {
    const parts: string[] = []
    const cc = (r.encode || "").trim()
    if (cc && cc !== "0.00") parts.push(cc)
    parts.push(...parseTimeslots(r.description))
    return parts.length ? parts.join("/") : "N/A"
  }
  if (!r.encode || r.encode === "0.00") return "N/A"
  return r.encode
}

// Numeric value used for sorting tones; "N/A" sorts last
function toneSortValue(encode: string): number {
  if (!encode || encode === "0.00") return Number.POSITIVE_INFINITY
  const n = Number.parseFloat(encode)
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n
}

// Color-coded styling for each digital/analog mode
const MODE_STYLES: Record<string, string> = {
  FM: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DMR: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  YSF: "bg-green-500/15 text-green-400 border-green-500/30",
  C4FM: "bg-green-500/15 text-green-400 border-green-500/30",
  "D-STAR": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  DSTAR: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  P25: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  NXDN: "bg-rose-500/15 text-rose-400 border-rose-500/30",
}

function ModePills({ mode }: { mode: string }) {
  if (!mode) return <span className="text-muted-foreground">—</span>
  const parts = mode.split(/[/,]/).map((p) => p.trim()).filter(Boolean)
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((part) => {
        const style = MODE_STYLES[part.toUpperCase()] ?? "bg-muted text-muted-foreground border-border"
        return (
          <span key={part} className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
            {part}
          </span>
        )
      })}
    </span>
  )
}

const MODE_OPTIONS = ["Any", "FM", "DMR", "YSF", "C4FM", "D-STAR", "P25", "NXDN"]
const RADIUS_OPTIONS = ["25", "50", "100"]

export function RepeaterLookupPage() {
  const [inputValue, setInputValue] = useState("")
  const [radius, setRadius] = useState("25")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Repeater[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [locationLabel, setLocationLabel] = useState<string | null>(null)
  const [searchRadius, setSearchRadius] = useState("25")

  // Advanced filters (client-side)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filterCallsign, setFilterCallsign] = useState("")
  const [filterFrequency, setFilterFrequency] = useState("")
  const [filterMode, setFilterMode] = useState("Any")

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("distance")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const runSearch = useCallback(
    async (lat: number, lon: number, label: string, radiusMiles: string) => {
      setIsSearching(true)
      setError(null)
      setLocationLabel(label)
      try {
        const response = await fetch(`/api/repeaters?lat=${lat}&lon=${lon}&radius=${radiusMiles}`)
        if (!response.ok) {
          throw new Error("Failed to fetch repeaters")
        }
        const data = await response.json()
        setResults(data.repeaters || [])
        setSearchRadius(radiusMiles)
        setHasSearched(true)
      } catch {
        setError("Unable to load repeaters. Please try again.")
        setResults([])
        setHasSearched(true)
      } finally {
        setIsSearching(false)
      }
    },
    [],
  )

  const fetchIpLocation = useCallback(async () => {
    setIsSearching(true)
    setError(null)
    try {
      const response = await fetch("/api/ip-location")
      const data = await response.json()
      if (!response.ok || typeof data.lat !== "number" || typeof data.lon !== "number") {
        setIsSearching(false)
        setError("Couldn't determine your location by IP. Enter a ZIP code or grid square instead.")
        return
      }
      runSearch(data.lat, data.lon, data.label || "your approximate location", radius)
    } catch {
      setIsSearching(false)
      setError("Couldn't determine your location by IP. Enter a ZIP code or grid square instead.")
    }
  }, [runSearch, radius])

  const handleUseLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      fetchIpLocation()
      return
    }
    setIsSearching(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        runSearch(latitude, longitude, "your current location", radius)
      },
      () => {
        fetchIpLocation()
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [runSearch, fetchIpLocation, radius])

  const handleManualSearch = useCallback(async () => {
    const value = inputValue.trim()
    if (!value) {
      setError("Enter a ZIP code or grid square to search.")
      return
    }

    const isGrid = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?$/.test(value)
    if (isGrid) {
      const coords = gridToLatLon(value)
      if (!coords) {
        setError("Invalid grid square format.")
        return
      }
      runSearch(coords.lat, coords.lon, value.toUpperCase(), radius)
      return
    }

    if (/^\d{5}$/.test(value)) {
      setIsSearching(true)
      setError(null)
      try {
        const response = await fetch(`/api/grid-lookup?zip=${encodeURIComponent(value)}`)
        const data = await response.json()
        if (!data.grid) {
          setIsSearching(false)
          setError("Could not find a location for that ZIP code.")
          return
        }
        const coords = gridToLatLon(data.grid)
        if (!coords) {
          setIsSearching(false)
          setError("Could not resolve coordinates for that ZIP code.")
          return
        }
        runSearch(coords.lat, coords.lon, `ZIP ${value}`, radius)
      } catch {
        setIsSearching(false)
        setError("Something went wrong looking up that ZIP code.")
      }
      return
    }

    setError("Enter a valid 5-digit US ZIP code or Maidenhead grid square (e.g., EN82).")
  }, [inputValue, runSearch, radius])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleManualSearch()
    }
  }

  // Apply advanced filters + sorting
  const filteredResults = useMemo(() => {
    const cs = filterCallsign.trim().toUpperCase()
    const freq = filterFrequency.trim()
    const mode = filterMode

    const filtered = results.filter((r) => {
      if (cs && !(r.callsign || "").toUpperCase().includes(cs)) return false
      if (freq && !formatFrequency(r.frequency).includes(freq)) return false
      if (mode !== "Any" && !(r.mode || "").toUpperCase().includes(mode.toUpperCase())) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "callsign":
          cmp = (a.callsign || "").localeCompare(b.callsign || "")
          break
        case "frequency":
          cmp = a.frequency - b.frequency
          break
        case "offset":
          cmp = a.offset - b.offset
          break
        case "tone":
          cmp = toneSortValue(a.encode) - toneSortValue(b.encode)
          break
        case "mode":
          cmp = (a.mode || "").localeCompare(b.mode || "")
          break
        case "distance":
          cmp = a.distance - b.distance
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return sorted
  }, [results, filterCallsign, filterFrequency, filterMode, sortKey, sortDir])

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortKey(key)
        setSortDir(key === "distance" || key === "frequency" || key === "offset" ? "asc" : "asc")
      }
    },
    [sortKey],
  )

  const exportToCSV = useCallback(() => {
    if (filteredResults.length === 0) return
    const headers = ["Call Sign", "City", "Frequency (MHz)", "Offset", "Tone", "Mode", "Distance (mi)", "Status"]
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }
    const rows = filteredResults.map((r) => [
      r.callsign || "",
      r.city || "",
      formatFrequency(r.frequency),
      formatOffset(r.offset),
      formatTone(r),
      r.mode || "",
      r.distance.toFixed(1),
      r.operational === 0 ? "Offline" : "Operational",
    ])
    const csvContent = [headers.join(","), ...rows.map((row) => row.map(escapeCSV).join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const now = new Date()
    const dateStr = now.toISOString().split("T")[0]
    const timeStr = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "")
    link.download = `repeater-lookup-${dateStr}-${timeStr}UTC.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [filteredResults])

  // Sortable column header button
  const SortHeader = ({ label, sortKeyName, align = "left" }: { label: string; sortKeyName: SortKey; align?: "left" | "right" }) => {
    const active = sortKey === sortKeyName
    return (
      <th scope="col" className={`px-3 py-2 font-medium text-foreground ${align === "right" ? "text-right" : "text-left"}`} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => toggleSort(sortKeyName)}
          className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${align === "right" ? "flex-row-reverse" : ""}`}
          aria-label={`Sort by ${label}${active ? (sortDir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
          )}
        </button>
      </th>
    )
  }

  return (
    <div className="container mx-auto px-3 md:px-4 py-6 md:py-10">
      <div className="text-center mb-6 md:mb-8">
        <h2 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 text-balance">Repeater Lookup</h2>
        <p className="text-muted-foreground text-sm md:text-xl max-w-2xl mx-auto text-pretty">
          Find nearby amateur radio repeaters by location, then filter and sort the results.
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {/* Location search controls */}
        <div className="space-y-3" role="search" aria-label="Repeater location search">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={handleUseLocation}
            disabled={isSearching}
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Use my location
          </Button>

          <div className="flex items-center gap-2" role="presentation">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label htmlFor="repeater-location-input" className="sr-only">
                US ZIP code or Maidenhead grid square
              </label>
              <Input
                id="repeater-location-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ZIP code or grid square (e.g., 48201 or EN82)"
                aria-describedby="repeater-input-hint"
                disabled={isSearching}
              />
            </div>
            <div className="flex gap-2">
              <div>
                <label htmlFor="repeater-radius" className="sr-only">
                  Search radius in miles
                </label>
                <Select value={radius} onValueChange={setRadius} disabled={isSearching}>
                  <SelectTrigger id="repeater-radius" className="w-[110px]" aria-label="Search radius in miles">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r} miles
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={handleManualSearch} disabled={isSearching} className="gap-2">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                )}
                Search
              </Button>
            </div>
          </div>
          <p id="repeater-input-hint" className="text-xs text-muted-foreground">
            Searches for repeaters within the selected radius. Falls back to approximate IP location if GPS is
            unavailable.
          </p>

          {/* Advanced search toggle */}
          <div>
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setShowAdvanced((s) => !s)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-search-panel"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Advanced search
            </Button>

            {showAdvanced && (
              <div
                id="advanced-search-panel"
                className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-border bg-card p-3"
                role="group"
                aria-label="Advanced result filters"
              >
                <div>
                  <label htmlFor="filter-callsign" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Call sign
                  </label>
                  <Input
                    id="filter-callsign"
                    value={filterCallsign}
                    onChange={(e) => setFilterCallsign(e.target.value.toUpperCase())}
                    placeholder="e.g., W8"
                  />
                </div>
                <div>
                  <label htmlFor="filter-frequency" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Frequency (MHz)
                  </label>
                  <Input
                    id="filter-frequency"
                    value={filterFrequency}
                    onChange={(e) => setFilterFrequency(e.target.value)}
                    placeholder="e.g., 146"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label htmlFor="filter-mode" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Mode
                  </label>
                  <Select value={filterMode} onValueChange={setFilterMode}>
                    <SelectTrigger id="filter-mode" aria-label="Filter by mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="max-w-4xl mx-auto mt-6" aria-live="polite">
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Searching for nearby repeaters...</span>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && !error && (
          <div className="py-8 text-center text-muted-foreground">
            <Radio className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
            <p>
              No repeaters found within {searchRadius} miles{locationLabel ? ` of ${locationLabel}` : ""}.
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="sr-only">Search results: </span>
                Showing {filteredResults.length} of {results.length} repeater{results.length === 1 ? "" : "s"} within{" "}
                {searchRadius} miles{locationLabel ? ` of ${locationLabel}` : ""}.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 self-start sm:self-auto"
                onClick={exportToCSV}
                disabled={filteredResults.length === 0}
                aria-label="Download results as CSV file"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download
              </Button>
            </div>

            {filteredResults.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground rounded-lg border border-border">
                <p>No repeaters match your advanced filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm" aria-label="Nearby repeaters">
                  <thead>
                    <tr className="bg-muted">
                      <SortHeader label="Call Sign" sortKeyName="callsign" />
                      <SortHeader label="Frequency" sortKeyName="frequency" />
                      <SortHeader label="Offset" sortKeyName="offset" />
                      <SortHeader label="Tone" sortKeyName="tone" />
                      <SortHeader label="Mode" sortKeyName="mode" />
                      <SortHeader label="Distance" sortKeyName="distance" align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-foreground">{r.callsign || "Unknown"}</span>
                            {r.operational === 0 && (
                              <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                                Offline
                              </span>
                            )}
                          </div>
                          {r.city && <span className="text-xs text-muted-foreground">{r.city}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {formatFrequency(r.frequency)}
                          <span className="text-muted-foreground"> MHz</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatOffset(r.offset)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatTone(r)}</td>
                        <td className="px-3 py-2">
                          <ModePills mode={r.mode} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                          {r.distance.toFixed(1)} mi
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!isSearching && !hasSearched && (
          <div className="py-10 text-center text-muted-foreground">
            <Radio className="mx-auto mb-3 h-10 w-10 opacity-40" aria-hidden="true" />
            <p>Search by location to find nearby repeaters.</p>
          </div>
        )}
      </div>
    </div>
  )
}
