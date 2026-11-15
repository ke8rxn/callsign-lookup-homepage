export type Part90Service = "IG" | "YG"

export const SERVICE_LABELS: Record<Part90Service, string> = {
  IG: "Industrial/Business Conventional",
  YG: "Industrial/Business Trunked",
}

export const PAGE_SIZE = 50

export type Part90Mode = "callsign" | "name" | "frequency" | "county" | "range" | "frn" | "city" | "advanced"

export const MODES: { value: Part90Mode; label: string }[] = [
  { value: "callsign", label: "Callsign" },
  { value: "name", label: "Business" },
  { value: "frequency", label: "Frequency" },
  { value: "county", label: "County" },
  { value: "range", label: "Freq. Range" },
  { value: "frn", label: "FRN" },
  { value: "city", label: "City" },
  { value: "advanced", label: "Advanced" },
]

export type FieldKey =
  | "callsign"
  | "name"
  | "frn"
  | "frequency"
  | "min"
  | "max"
  | "state"
  | "county"
  | "city"
  | "zip"
  | "service"
  | "station_class"

export type Criteria = Partial<Record<FieldKey, string>>

export const FIELD_KEYS: FieldKey[] = [
  "callsign",
  "name",
  "frn",
  "frequency",
  "min",
  "max",
  "state",
  "county",
  "city",
  "zip",
  "service",
  "station_class",
]

export const MODE_FIELDS: Record<Part90Mode, FieldKey[]> = {
  callsign: ["callsign"],
  name: ["name", "state", "service"],
  frequency: ["frequency", "state", "county", "service"],
  county: ["state", "county", "service"],
  range: ["min", "max", "state", "county", "service"],
  frn: ["frn"],
  city: ["state", "city", "service"],
  advanced: [
    "callsign",
    "name",
    "frn",
    "service",
    "state",
    "county",
    "city",
    "zip",
    "frequency",
    "min",
    "max",
    "station_class",
  ],
}

export const REQUIRED_FIELDS: Partial<Record<Part90Mode, FieldKey[]>> = {
  callsign: ["callsign"],
  name: ["name"],
  frequency: ["frequency"],
  county: ["state", "county"],
  range: ["min", "max"],
  frn: ["frn"],
  city: ["state", "city"],
}

export interface ValidationError {
  field: FieldKey | null
  message: string
}

const MAX_RANGE_MHZ = 10

function isFrequency(value: string) {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) && n > 0 && n < 100000
}

export function normalizeCriteria(mode: Part90Mode, draft: Criteria): Criteria {
  const out: Criteria = {}
  for (const key of MODE_FIELDS[mode]) {
    const raw = draft[key]?.trim()
    if (!raw || raw === "any") continue
    out[key] = ["callsign", "state", "county", "city", "station_class"].includes(key) ? raw.toUpperCase() : raw
  }
  return out
}

export function validateCriteria(mode: Part90Mode, c: Criteria): ValidationError | null {
  for (const field of REQUIRED_FIELDS[mode] ?? []) {
    if (!c[field]) {
      if (field === "state" && (mode === "county" || mode === "city")) {
        return { field, message: mode === "county" ? "County searches require a state." : "City searches require a state." }
      }
      return { field, message: `Enter ${FIELD_META[field].label.toLowerCase()} to search.` }
    }
  }

  if (mode === "advanced" && !Object.keys(c).length) {
    return { field: "callsign", message: "Enter at least one search criterion." }
  }
  if (c.callsign && !/^[A-Z0-9]{3,10}$/.test(c.callsign)) {
    return { field: "callsign", message: "Callsigns are 3 to 10 letters and numbers." }
  }
  if (c.name && c.name.length < 3) {
    return { field: "name", message: "Business name searches need at least 3 characters." }
  }
  if (c.frn && !/^\d{10}$/.test(c.frn)) {
    return { field: "frn", message: "FRNs must contain exactly 10 digits." }
  }
  if (c.zip && !/^\d{5}$/.test(c.zip)) {
    return { field: "zip", message: "ZIP codes must be 5 digits." }
  }
  if (c.county && !c.state) {
    return { field: "state", message: "County searches require a state." }
  }
  if (c.city && !c.state) {
    return { field: "state", message: "City searches require a state." }
  }
  if (c.frequency && !isFrequency(c.frequency)) {
    return { field: "frequency", message: "Enter the frequency in MHz, for example 464.500." }
  }
  if (c.frequency && (c.min || c.max)) {
    return { field: "frequency", message: "Use either an exact frequency or a frequency range, not both." }
  }
  if (c.min || c.max) {
    if (!c.min) return { field: "min", message: "A frequency range needs both a minimum and a maximum." }
    if (!c.max) return { field: "max", message: "A frequency range needs both a minimum and a maximum." }
    if (!isFrequency(c.min)) return { field: "min", message: "Enter the minimum frequency in MHz." }
    if (!isFrequency(c.max)) return { field: "max", message: "Enter the maximum frequency in MHz." }
    const min = Number(c.min)
    const max = Number(c.max)
    if (min >= max) return { field: "max", message: "The maximum frequency must be higher than the minimum." }
    if (max - min > MAX_RANGE_MHZ) return { field: "max", message: "Frequency ranges may not exceed 10 MHz." }
  }
  return null
}

export const FIELD_META: Record<
  FieldKey,
  { label: string; placeholder?: string; hint?: string; inputMode?: "text" | "decimal" | "numeric" }
> = {
  callsign: { label: "Callsign", placeholder: "WPCG711" },
  name: { label: "Business or licensee name", placeholder: "City of Grand Rapids", hint: "At least 3 characters." },
  frn: { label: "FRN", placeholder: "0033289794", hint: "Exactly 10 digits.", inputMode: "numeric" },
  frequency: { label: "Frequency (MHz)", placeholder: "464.500", inputMode: "decimal" },
  min: { label: "Minimum frequency (MHz)", placeholder: "450", inputMode: "decimal" },
  max: { label: "Maximum frequency (MHz)", placeholder: "451", inputMode: "decimal", hint: "Ranges may span up to 10 MHz." },
  state: { label: "State" },
  county: { label: "County", placeholder: "Kent", hint: "FCC licensed-location county, not mailing address." },
  city: { label: "City", placeholder: "Grand Rapids", hint: "FCC licensed-location city." },
  zip: { label: "ZIP code", placeholder: "49503", inputMode: "numeric" },
  service: { label: "Radio service" },
  station_class: { label: "Station class", placeholder: "FB2" },
}

function seg(value: string) {
  return encodeURIComponent(value)
}

function query(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

const API = "/api/part90"

export function buildListUrl(mode: Part90Mode, c: Criteria, offset: number): string | null {
  const page = { limit: PAGE_SIZE, offset }
  switch (mode) {
    case "callsign":
      return null
    case "name":
      return `${API}/name/${seg(c.name!)}${query({ state: c.state, service: c.service, ...page })}`
    case "frequency":
      return `${API}/frequency/${seg(c.frequency!)}${query({ state: c.state, county: c.county, service: c.service, ...page })}`
    case "range":
      return `${API}/frequencies${query({ min: c.min, max: c.max, state: c.state, county: c.county, service: c.service, ...page })}`
    case "frn":
      return `${API}/frn/${seg(c.frn!)}${query(page)}`
    case "county":
      return `${API}/county/${seg(c.state!)}/${seg(c.county!)}${query({ service: c.service, ...page })}`
    case "city":
      return `${API}/city/${seg(c.state!)}/${seg(c.city!)}${query({ service: c.service, ...page })}`
    case "advanced":
      return `${API}/search${query({
        callsign: c.callsign,
        frn: c.frn,
        name: c.name,
        service: c.service,
        state: c.state,
        county: c.county,
        city: c.city,
        zip: c.zip,
        frequency: c.frequency,
        frequency_min: c.min,
        frequency_max: c.max,
        station_class: c.station_class,
        ...page,
      })}`
  }
}

export function buildDetailUrl(callsign: string) {
  return `${API}/callsign/${seg(callsign.toUpperCase())}`
}

export interface Paged<T> {
  query: Record<string, unknown>
  total: number
  returned: number
  limit: number
  offset: number
  results: T[]
}

export interface LicenseRow {
  callsign: string
  licensee_name?: string | null
  service?: string | null
  status?: string | null
  frn?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip?: string | null
  grant_date?: string | null
  expiration_date?: string | null
  location_count?: number | null
  frequency_count?: number | null
}

export interface FrequencyRow {
  frequency: number
  station_class?: string | null
  callsign: string
  licensee_name?: string | null
  service?: string | null
  location_number?: number | null
  address?: string | null
  city?: string | null
  county?: string | null
  state?: string | null
  power_output?: number | null
  power_erp?: number | null
  number_of_units?: number | null
}

export type ResultRow = LicenseRow | FrequencyRow

export type ResultKind = "license" | "frequency" | "location"

export function detectKind(rows: ResultRow[]): ResultKind {
  const first = rows[0] as unknown as Record<string, unknown> | undefined
  if (!first) return "license"
  if ("frequency" in first) return "frequency"
  if ("location_count" in first || "frequency_count" in first) return "location"
  return "license"
}

export interface DetailFrequency {
  frequency_number?: number | null
  antenna_number?: number | null
  station_class?: string | null
  frequency_assigned: number
  frequency_upper_band?: number | null
  power_output?: number | null
  power_erp?: number | null
  number_of_units?: number | null
  date_first_used?: string | null
}

export interface DetailLocation {
  location_number: number
  location_type?: string | null
  location_name?: string | null
  address?: string | null
  city?: string | null
  county?: string | null
  state?: string | null
  latitude?: number | null
  longitude?: number | null
  radius?: number | null
  ground_elevation?: number | null
  tower_registration_number?: string | null
  overall_structure_height?: number | null
  corresponding_fixed_location?: number | null
  frequencies: DetailFrequency[]
}

export interface Part90Detail {
  license: {
    callsign: string
    service?: string | null
    status?: string | null
    grant_date?: string | null
    expiration_date?: string | null
    effective_date?: string | null
    licensee_name?: string | null
    mailing_address?: string | null
    mailing_city?: string | null
    mailing_state?: string | null
    mailing_zip?: string | null
    frn?: string | null
  }
  locations: DetailLocation[]
}

export interface Part90Meta {
  built_at?: string
  counts?: { frequencies?: number; licenses?: number; locations?: number }
  service_counts?: Partial<Record<Part90Service, number>>
  license_status?: string
  emissions_included?: boolean
  dataset?: string
}

export class Part90Error extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function part90Fetcher<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Part90Error(UNAVAILABLE_MESSAGE, 503)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Part90Error(body?.error ?? UNAVAILABLE_MESSAGE, res.status)
  }
  return res.json() as Promise<T>
}

export const UNAVAILABLE_MESSAGE =
  "The Part 90 database is temporarily unavailable. Please try again in a few minutes."
export const NO_MATCHES_MESSAGE = "No active IG/YG licenses were found for this search."

export function isService(value: string | null | undefined): value is Part90Service {
  return value === "IG" || value === "YG"
}

export function formatFrequency(value: number | null | undefined) {
  if (value === null || value === undefined) return ""
  const [whole, decimals = ""] = value.toFixed(6).replace(/0+$/, "").split(".")
  return `${whole}.${decimals.padEnd(3, "0")}`
}

export function formatWatts(value: number | null | undefined) {
  if (value === null || value === undefined) return ""
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} W`
}

export function joinParts(...parts: (string | null | undefined)[]) {
  return parts.filter((p) => p && p.trim() && p.trim().toUpperCase() !== "N/A").join(", ")
}

export function hasValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") {
    const v = value.trim()
    return v !== "" && v.toUpperCase() !== "N/A"
  }
  return true
}

const LOCATION_TYPES: Record<string, string> = { F: "Fixed", M: "Mobile" }

export function locationTypeLabel(code: string | null | undefined) {
  if (!code) return ""
  return LOCATION_TYPES[code] ?? code
}

export function statusLabel(code: string | null | undefined) {
  if (!code) return ""
  return code === "A" ? "Active" : code
}

export function criteriaSummary(mode: Part90Mode, c: Criteria) {
  const parts: string[] = []
  if (c.callsign) parts.push(`callsign ${c.callsign}`)
  if (c.name) parts.push(`name "${c.name}"`)
  if (c.frn) parts.push(`FRN ${c.frn}`)
  if (c.frequency) parts.push(`${c.frequency} MHz`)
  if (c.min && c.max) parts.push(`${c.min}–${c.max} MHz`)
  if (c.city) parts.push(c.city)
  if (c.county) parts.push(`${c.county} County`)
  if (c.state) parts.push(c.state)
  if (c.zip) parts.push(`ZIP ${c.zip}`)
  if (c.service) parts.push(c.service)
  if (c.station_class) parts.push(`class ${c.station_class}`)
  return parts.join(", ") || MODES.find((m) => m.value === mode)?.label || ""
}
