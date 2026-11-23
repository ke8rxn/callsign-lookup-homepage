import { formatStreet } from "@/lib/license-format"

export interface CountyMatcher {
  state: string
  /** Selected county FIPS codes (5 digits) */
  counties: string[]
  /** Normalized place name -> whether that place lies in any selected county */
  cities: Record<string, boolean>
  /** Places that lie partly inside and partly outside the selected counties */
  splitCities: string[]
  /** ZIP -> share of its land area inside the selected counties (0-1) */
  zipShare: Record<string, number>
}

export interface GeocodeAddress {
  key: string
  street: string
  city: string
  state: string
  zip: string
}

/** County FIPS for each geocoded address key; null means the Census Geocoder found no match */
export type GeocodedCounties = Record<string, string | null>

type AddressRecord = { street?: string; city?: string; state?: string; zip?: string }

const AMBIGUOUS_ZIP_SHARE = { min: 0.15, max: 0.85 }

const PLACE_SUFFIX =
  /\b(charter township|township|village|city|town|cdp|borough|municipality|plantation|\(balance\))\b/g

export function normalizePlaceName(name: string): string {
  return name
    .split(",")[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/\bsainte\b/g, "ste")
    .replace(/\bmount\b/g, "mt")
    .replace(/\bfort\b/g, "ft")
    .replace(PLACE_SUFFIX, "")
    .replace(/[^a-z]/g, "")
}

/**
 * Decides whether a license address falls in the selected counties.
 * Known place names are matched directly; mailing-only names (post office
 * names that aren't Census places) fall back to where most of the ZIP's land is.
 */
export function isInSelectedCounties(
  record: { city?: string; state?: string; zip?: string },
  matcher: CountyMatcher,
): boolean {
  if (record.state && record.state.toUpperCase() !== matcher.state) return false
  const key = record.city ? normalizePlaceName(record.city) : ""
  if (key && key in matcher.cities) return matcher.cities[key]
  const zip = record.zip?.slice(0, 5) ?? ""
  return (matcher.zipShare[zip] ?? 0) >= 0.5
}

/**
 * Builds a Census-Geocoder-ready address, or null when street matching can't
 * help: PO boxes, rural routes, general delivery, or missing fields.
 */
export function toGeocodeAddress(record: AddressRecord): GeocodeAddress | null {
  const raw = record.street?.trim() ?? ""
  const city = record.city?.trim() ?? ""
  const state = record.state?.trim().toUpperCase() ?? ""
  const zip = record.zip?.slice(0, 5) ?? ""
  if (!raw || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(zip)) return null

  const street = formatStreet(raw)
  if (/^PO Box\b/i.test(street) || /\b(?:R\.?R\.?|RFD|HC|Rural Route|General Delivery)\b/i.test(street)) return null
  if (!/^\d/.test(street)) return null

  const key = `${street}|${city}|${state}|${zip}`.toLowerCase().replace(/\s+/g, " ")
  return { key, street, city, state, zip }
}

/**
 * True only where the city/ZIP heuristic is weakest: a city that straddles the
 * county line, or an unrecognized city in a ZIP that is substantially split.
 */
export function needsGeocode(record: AddressRecord, matcher: CountyMatcher): boolean {
  if (record.state?.toUpperCase() !== matcher.state) return false
  if (!toGeocodeAddress(record)) return false

  const cityKey = record.city ? normalizePlaceName(record.city) : ""
  if (cityKey && cityKey in matcher.cities) return matcher.splitCities.includes(cityKey)

  const share = matcher.zipShare[record.zip?.slice(0, 5) ?? ""] ?? 0
  return share > AMBIGUOUS_ZIP_SHARE.min && share < AMBIGUOUS_ZIP_SHARE.max
}

/** Uses a geocoded county when one is available, otherwise the city/ZIP heuristic. */
export function isInSelectedCountiesHybrid(
  record: AddressRecord,
  matcher: CountyMatcher,
  geocoded: GeocodedCounties | undefined,
): boolean {
  if (geocoded && needsGeocode(record, matcher)) {
    const address = toGeocodeAddress(record)
    const fips = address ? geocoded[address.key] : undefined
    if (fips) return matcher.counties.includes(fips)
  }
  return isInSelectedCounties(record, matcher)
}
