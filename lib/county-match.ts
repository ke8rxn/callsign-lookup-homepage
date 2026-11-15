export interface CountyMatcher {
  state: string
  /** Normalized place name -> whether that place lies in any selected county */
  cities: Record<string, boolean>
  /** ZIP -> share of its land area inside the selected counties (0-1) */
  zipShare: Record<string, number>
}

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
