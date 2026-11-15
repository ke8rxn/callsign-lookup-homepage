"use client"

import type { RefObject } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
        </p>
        <ServiceLegend />
      </div>

      <div className={`${tableClass} overflow-x-auto rounded-lg border border-border`}>
        <table className="w-full text-sm">
          <caption className="sr-only">
            Part 90 search results for {summary}, page {page} of {pageCount}
          </caption>
          <thead>
            <tr className="bg-muted">
              {kind === "frequency" ? (
                <>
                  <th scope="col" className={th}>Frequency (MHz)</th>
                  <th scope="col" className={th}>Callsign</th>
                  <th scope="col" className={th}>Licensee</th>
                  <th scope="col" className={th}>Service</th>
                  <th scope="col" className={th}>Station class</th>
                  <th scope="col" className={th}>FCC licensed location</th>
                  <th scope="col" className={`${th} text-right`}>Power</th>
                  <th scope="col" className={`${th} text-right`}>ERP</th>
                  <th scope="col" className={`${th} text-right`}>Units</th>
                </>
              ) : (
                <>
                  <th scope="col" className={th}>Callsign</th>
                  <th scope="col" className={th}>Licensee</th>
                  <th scope="col" className={th}>Service</th>
                  <th scope="col" className={th}>FRN</th>
                  {kind === "location" ? (
                    <>
                      <th scope="col" className={`${th} text-right`}>Licensed locations</th>
                      <th scope="col" className={`${th} text-right`}>Frequency records</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className={th}>Licensee mailing address</th>
                      <th scope="col" className={th}>Granted</th>
                      <th scope="col" className={th}>Expires</th>
                    </>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {kind === "frequency"
              ? (data.results as FrequencyRow[]).map((r, i) => (
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
              : (data.results as LicenseRow[]).map((r) => (
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
          ? (data.results as FrequencyRow[]).map((r, i) => (
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
          : (data.results as LicenseRow[]).map((r) => (
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
