"use client"

import { useState, useCallback } from "react"
import { MapPin, Loader2, Radio, Navigation } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
}

interface RepeaterLookupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

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
    // center of the sub-square
    lon += 2 / 24 / 2
    lat += 1 / 24 / 2
  } else {
    // center of the 2° x 1° square
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

export function RepeaterLookup({ open, onOpenChange }: RepeaterLookupProps) {
  const [inputValue, setInputValue] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Repeater[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [locationLabel, setLocationLabel] = useState<string | null>(null)

  const runSearch = useCallback(async (lat: number, lon: number, label: string) => {
    setIsSearching(true)
    setError(null)
    setLocationLabel(label)
    try {
      const response = await fetch(`/api/repeaters?lat=${lat}&lon=${lon}&radius=25`)
      if (!response.ok) {
        throw new Error("Failed to fetch repeaters")
      }
      const data = await response.json()
      setResults(data.repeaters || [])
      setHasSearched(true)
    } catch {
      setError("Unable to load repeaters. Please try again.")
      setResults([])
      setHasSearched(true)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleUseLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.")
      return
    }
    setIsSearching(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        runSearch(latitude, longitude, "your current location")
      },
      () => {
        setIsSearching(false)
        setError("Location access denied. Enter a ZIP code or grid square instead.")
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [runSearch])

  const handleManualSearch = useCallback(async () => {
    const value = inputValue.trim()
    if (!value) {
      setError("Enter a ZIP code or grid square to search.")
      return
    }

    // Grid square: 4 or 6 characters (2 letters, 2 digits, optional 2 letters)
    const isGrid = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?$/.test(value)
    if (isGrid) {
      const coords = gridToLatLon(value)
      if (!coords) {
        setError("Invalid grid square format.")
        return
      }
      runSearch(coords.lat, coords.lon, value.toUpperCase())
      return
    }

    // ZIP code: 5 digits
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
        runSearch(coords.lat, coords.lon, `ZIP ${value}`)
      } catch {
        setIsSearching(false)
        setError("Something went wrong looking up that ZIP code.")
      }
      return
    }

    setError("Enter a valid 5-digit US ZIP code or Maidenhead grid square (e.g., EN82).")
  }, [inputValue, runSearch])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleManualSearch()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
        aria-describedby="repeater-dialog-description"
      >
        <DialogHeader>
          <DialogTitle>Repeater Lookup</DialogTitle>
          <DialogDescription id="repeater-dialog-description">
            Find amateur radio repeaters within 25 miles of a location. Use your current location, or enter a US ZIP
            code or Maidenhead grid square.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search controls */}
          <div className="space-y-3" role="search" aria-label="Repeater search">
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

            <div className="flex gap-2">
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
              <Button type="button" onClick={handleManualSearch} disabled={isSearching} className="gap-2">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                )}
                Search
              </Button>
            </div>
            <p id="repeater-input-hint" className="text-xs text-muted-foreground">
              Searches for repeaters within a 25 mile radius.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Results */}
          <div aria-live="polite">
            {isSearching && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span>Searching for nearby repeaters...</span>
              </div>
            )}

            {!isSearching && hasSearched && results.length === 0 && !error && (
              <div className="py-8 text-center text-muted-foreground">
                <Radio className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                <p>No repeaters found within 25 miles{locationLabel ? ` of ${locationLabel}` : ""}.</p>
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <span className="sr-only">Search results: </span>
                  Found {results.length} repeater{results.length === 1 ? "" : "s"} within 25 miles
                  {locationLabel ? ` of ${locationLabel}` : ""}.
                </p>
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{r.callsign || "Unknown"}</span>
                          {r.operational === 0 && (
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                              Offline
                            </span>
                          )}
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {r.distance.toFixed(1)} mi
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-3">
                        <span>
                          <span className="text-foreground">{formatFrequency(r.frequency)}</span> MHz
                        </span>
                        <span>{formatOffset(r.offset)}</span>
                        {r.encode && r.encode !== "0.00" && <span>Tone {r.encode}</span>}
                        {r.mode && <span>{r.mode}</span>}
                        {r.city && <span className="col-span-2 sm:col-span-3">{r.city}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
