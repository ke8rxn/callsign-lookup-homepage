"use client"

import { useMemo, useState, type RefObject } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CallsignLink, Field, ServiceBadge, ServiceLegend } from "@/components/part90/part90-shared"
import { Part90LicensePopup } from "@/components/part90/part90-license-popup"
import {
  PAGE_SIZE,
  detectKind,
  formatFrequency,
  formatWatts,
  joinParts,
  type FrequencyRow,
  type LicenseRow,
  type Paged,
  type ResultRow,
} from "@/lib/part90"

interface Props {
  data: Paged<ResultRow>
  summary: string
  headingRef: RefObject<HTMLHeadingElement | null>
  detailHref: (callsign: string) => string
  onOpenDetail: (callsign: string) => void
  onPage: (offset: number) => void
}

const th = "px-3 py-2 text-left align-bottom font-medium text-foreground"
const td = "px-3 py-2 text-muted-foreground"

function mailing(r: LicenseRow) {
  const cityState = joinParts(r.mailing_city, r.mailing_state)
  return [cityState, r.mailing_zip?.slice(0, 5)].filter(Boolean).join(" ")
}

function licensedLocation(r: FrequencyRow) {
  const place = joinParts(r.address, r.city, r.county ? `${r.county} County` : null, r.state)
  const loc = r.location_number ? `Location ${r.location_number}` : ""
  return [loc, place].filter(Boolean).join(": ")
}

type SortValue = string | number | null | undefined
type SortDir = "asc" | "desc"
type ResultKind = ReturnType<typeof detectKind>

interface Column {
  key: string
  label: string
  align?: "right"
  value: (r: ResultRow) => SortValue
}

// FCC dates arrive as MM/DD/YYYY; reorder so they compare chronologically.
function dateKey(s?: string | null) {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}${m[1]}${m[2]}` : s
}

const freq = (fn: (r: FrequencyRow) => SortValue) => (r: ResultRow) => fn(r as FrequencyRow)
const lic = (fn: (r: LicenseRow) => SortValue) => (r: ResultRow) => fn(r as LicenseRow)

const FREQUENCY_COLUMNS: Column[] = [
  { key: "frequency", label: "Frequency (MHz)", value: freq((r) => r.frequency) },
  { key: "callsign", label: "Callsign", value: freq((r) => r.callsign) },
  { key: "licensee", label: "Licensee", value: freq((r) => r.licensee_name) },
  { key: "service", label: "Service", value: freq((r) => r.service) },
  { key: "class", label: "Station class", value: freq((r) => r.station_class) },
  { key: "location", label: "FCC licensed location", value: freq((r) => licensedLocation(r)) },
  { key: "power", label: "Power", align: "right", value: freq((r) => r.power_output) },
  { key: "erp", label: "ERP", align: "right", value: freq((r) => r.power_erp) },
  { key: "units", label: "Units", align: "right", value: freq((r) => r.number_of_units) },
]

const LICENSE_BASE_COLUMNS: Column[] = [
  { key: "callsign", label: "Callsign", value: lic((r) => r.callsign) },
  { key: "licensee", label: "Licensee", value: lic((r) => r.licensee_name) },
  { key: "service", label: "Service", value: lic((r) => r.service) },
  { key: "frn", label: "FRN", value: lic((r) => r.frn) },
]

const LOCATION_COLUMNS: Column[] = [
  ...LICENSE_BASE_COLUMNS,
  { key: "locations", label: "Licensed locations", align: "right", value: lic((r) => r.location_count) },
  { key: "frequencies", label: "Frequency records", align: "right", value: lic((r) => r.frequency_count) },
]

const LICENSE_COLUMNS: Column[] = [
  ...LICENSE_BASE_COLUMNS,
  { key: "mailing", label: "Licensee mailing address", value: lic((r) => mailing(r)) },
  { key: "granted", label: "Granted", value: lic((r) => dateKey(r.grant_date)) },
  { key: "expires", label: "Expires", value: lic((r) => dateKey(r.expiration_date)) },
]

function columnsFor(kind: ResultKind) {
  if (kind === "frequency") return FREQUENCY_COLUMNS
  if (kind === "location") return LOCATION_COLUMNS
  return LICENSE_COLUMNS
}

const isEmpty = (v: SortValue) => v == null || v === ""

function sortRows(rows: ResultRow[], column: Column, dir: SortDir) {
  return [...rows].sort((x, y) => {
    const a = column.value(x)
    const b = column.value(y)
    // Blank values stay at the bottom in either direction.
    if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1
    const cmp =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
    return dir === "asc" ? cmp : -cmp
  })
}

function SortHeader({
  column,
  dir,
  onToggle,
}: {
  column: Column
  dir: SortDir | null
  onToggle: (key: string) => void
}) {
  const right = column.align === "right"
  return (
    <th
      scope="col"
      className={`${th} ${right ? "text-right" : ""}`}
      aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(column.key)}
        className={`inline-flex items-center gap-1 rounded-sm text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          right ? "flex-row-reverse text-right" : ""
        }`}
      >
        {column.label}
        {dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : dir === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden="true" />
        )}
        <span className="sr-only">
          {dir ? `, sorted ${dir === "asc" ? "ascending" : "descending"}` : ", activate to sort"}
        </span>
      </button>
    </th>
  )
}

export function rangeLabel(data: Paged<ResultRow>) {
  if (data.total === 0) return ""
  const start = data.offset + 1
  const end = data.offset + data.returned
  return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${data.total.toLocaleString()} result${
    data.total === 1 ? "" : "s"
  }`
}

export function Part90Results({ data, summary, headingRef, detailHref, onOpenDetail, onPage }: Props) {
  const kind = detectKind(data.results)
  const page = Math.floor(data.offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  // Frequency rows carry more columns, so they switch to a table only at wider widths.
  const tableClass = kind === "frequency" ? "hidden lg:block" : "hidden md:block"
  const cardsClass = kind === "frequency" ? "lg:hidden" : "md:hidden"
  const link = (cs: string) => <CallsignLink callsign={cs} href={detailHref(cs)} onOpen={onOpenDetail} />

  const columns = columnsFor(kind)
  const [sortState, setSortState] = useState<{ kind: ResultKind; key: string; dir: SortDir } | null>(null)
  // A sort chosen for one result type doesn't carry over to a table with different columns.
  const sort = sortState && sortState.kind === kind ? sortState : null
  const sortColumn = sort ? columns.find((c) => c.key === sort.key) : undefined

  const rows = useMemo(
    () => (sortColumn && sort ? sortRows(data.results, sortColumn, sort.dir) : data.results),
    [data.results, sortColumn, sort],
  )

  const toggleSort = (key: string) =>
    setSortState((prev) =>
      prev && prev.kind === kind && prev.key === key
        ? { ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { kind, key, dir: "asc" },
    )

  const onSortSelect = (value: string) => {
    if (!value) return setSortState(null)
    const [key, dir] = value.split(":") as [string, SortDir]
    setSortState({ kind, key, dir })
  }

  return (
    <section aria-labelledby="p90-results-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id="p90-results-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-foreground focus:outline-none"
        >
          {rangeLabel(data)}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {kind === "frequency" ? "Frequency records" : "Active licenses"} matching {summary}.
          {pageCount > 1 && ` Page ${page} of ${pageCount.toLocaleString()}.`}
          {sortColumn && sort && (
            <>
              {` Sorted by ${sortColumn.label.toLowerCase()}, ${sort.dir === "asc" ? "ascending" : "descending"}`}
              {pageCount > 1 ? " within this page." : "."}
            </>
          )}
        </p>
        <ServiceLegend />
      </div>

      <div className={`${cardsClass} flex flex-col gap-1`}>
        <label htmlFor="p90-sort-select" className="text-sm font-medium text-foreground">
          Sort results
        </label>
        <select
          id="p90-sort-select"
          value={sort ? `${sort.key}:${sort.dir}` : ""}
          onChange={(e) => onSortSelect(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Default order</option>
          {columns.map((c) => (
            <optgroup key={c.key} label={c.label}>
              <option value={`${c.key}:asc`}>{c.label}, ascending</option>
              <option value={`${c.key}:desc`}>{c.label}, descending</option>
            </optgroup>
          ))}
        </select>
      </div>

      <div className={`${tableClass} overflow-x-auto rounded-lg border border-border`}>
        <table className="w-full text-sm">
          <caption className="sr-only">
            Part 90 search results for {summary}, page {page} of {pageCount}
          </caption>
          <thead>
            <tr className="bg-muted">
              {columns.map((c) => (
                <SortHeader key={c.key} column={c} dir={sort?.key === c.key ? sort.dir : null} onToggle={toggleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {kind === "frequency"
              ? (rows as FrequencyRow[]).map((r, i) => (
                  <tr key={`${r.callsign}-${r.location_number}-${r.frequency}-${r.station_class}-${i}`} className="border-t border-border align-top">
                    <th scope="row" className="px-3 py-2 text-left font-mono font-semibold text-foreground whitespace-nowrap">
                      {formatFrequency(r.frequency)}
                    </th>
                    <td className="px-3 py-2">{link(r.callsign)}</td>
                    <td className="px-3 py-2 text-foreground">{r.licensee_name}</td>
                    <td className="px-3 py-2"><ServiceBadge service={r.service} /></td>
                    <td className={`${td} font-mono`}>{r.station_class}</td>
                    <td className={td}>{licensedLocation(r)}</td>
                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{formatWatts(r.power_output)}</td>
                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{formatWatts(r.power_erp)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.number_of_units?.toLocaleString()}</td>
                  </tr>
                ))
              : (rows as LicenseRow[]).map((r) => (
                  <tr key={r.callsign} className="border-t border-border align-top">
                    <th scope="row" className="px-3 py-2 text-left font-normal">{link(r.callsign)}</th>
                    <td className="px-3 py-2 text-foreground">{r.licensee_name}</td>
                    <td className="px-3 py-2"><ServiceBadge service={r.service} /></td>
                    <td className={`${td} font-mono`}>{r.frn}</td>
                    {kind === "location" ? (
                      <>
                        <td className={`${td} text-right`}>
                          <Part90LicensePopup kind="locations" callsign={r.callsign} licensee={r.licensee_name} count={r.location_count} onOpenDetail={onOpenDetail} />
                        </td>
                        <td className={`${td} text-right`}>
                          <Part90LicensePopup kind="frequencies" callsign={r.callsign} licensee={r.licensee_name} count={r.frequency_count} onOpenDetail={onOpenDetail} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={td}>{mailing(r)}</td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{r.grant_date}</td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{r.expiration_date}</td>
                      </>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <ul className={`${cardsClass} flex flex-col gap-2`} aria-label="Search results">
        {kind === "frequency"
          ? (rows as FrequencyRow[]).map((r, i) => (
              <li key={`${r.callsign}-${r.location_number}-${r.frequency}-${r.station_class}-${i}`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-lg font-semibold text-foreground">
                    {formatFrequency(r.frequency)} <span className="font-sans text-sm font-normal text-muted-foreground">MHz</span>
                  </p>
                  <ServiceBadge service={r.service} />
                </div>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {link(r.callsign)}
                  <span className="text-foreground">{r.licensee_name}</span>
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {r.station_class && <Field label="Station class"><span className="font-mono">{r.station_class}</span></Field>}
                  {licensedLocation(r) && <Field label="FCC licensed location">{licensedLocation(r)}</Field>}
                  {r.power_output != null && <Field label="Power">{formatWatts(r.power_output)}</Field>}
                  {r.power_erp != null && <Field label="ERP">{formatWatts(r.power_erp)}</Field>}
                  {r.number_of_units != null && <Field label="Units">{r.number_of_units.toLocaleString()}</Field>}
                </dl>
              </li>
            ))
          : (rows as LicenseRow[]).map((r) => (
              <li key={r.callsign} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg">{link(r.callsign)}</p>
                  <ServiceBadge service={r.service} />
                </div>
                {r.licensee_name && <p className="text-sm font-medium text-foreground">{r.licensee_name}</p>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {r.frn && <Field label="FRN"><span className="font-mono">{r.frn}</span></Field>}
                  {kind === "location" ? (
                    <>
                      {r.location_count != null && (
                        <Field label="Licensed locations">
                          <Part90LicensePopup kind="locations" callsign={r.callsign} licensee={r.licensee_name} count={r.location_count} onOpenDetail={onOpenDetail} />
                        </Field>
                      )}
                      {r.frequency_count != null && (
                        <Field label="Frequency records">
                          <Part90LicensePopup kind="frequencies" callsign={r.callsign} licensee={r.licensee_name} count={r.frequency_count} onOpenDetail={onOpenDetail} />
                        </Field>
                      )}
                    </>
                  ) : (
                    <>
                      {mailing(r) && <Field label="Licensee mailing address">{mailing(r)}</Field>}
                      {r.grant_date && <Field label="Granted">{r.grant_date}</Field>}
                      {r.expiration_date && <Field label="Expires">{r.expiration_date}</Field>}
                    </>
                  )}
                </dl>
              </li>
            ))}
      </ul>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2" aria-label="Results pages">
          <Button
            type="button"
            size="sm"
            className="gap-1"
            onClick={() => onPage(Math.max(0, data.offset - PAGE_SIZE))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous<span className="sr-only"> page</span>
          </Button>
          <p className="flex flex-col items-center text-center">
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {page.toLocaleString()} of {pageCount.toLocaleString()}
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            className="gap-1"
            onClick={() => onPage(data.offset + PAGE_SIZE)}
            disabled={page >= pageCount}
          >
            Next<span className="sr-only"> page</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  )
}
