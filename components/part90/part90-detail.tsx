"use client"

import { useState, type RefObject } from "react"
import { ArrowLeft, Check, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, ServiceBadge } from "@/components/part90/part90-shared"
import {
  formatFrequency,
  formatWatts,
  hasValue,
  joinParts,
  locationTypeLabel,
  statusLabel,
  type DetailFrequency,
  type DetailLocation,
  type Part90Detail,
} from "@/lib/part90"

interface Props {
  data: Part90Detail
  headingRef: RefObject<HTMLHeadingElement | null>
  backLabel: string
  onBack: () => void
}

const FREQ_COLUMNS: { key: keyof DetailFrequency; label: string; render: (f: DetailFrequency) => string; numeric?: boolean }[] = [
  { key: "frequency_assigned", label: "Frequency (MHz)", render: (f) => formatFrequency(f.frequency_assigned) },
  { key: "station_class", label: "Station class", render: (f) => f.station_class ?? "" },
  { key: "power_output", label: "Power output", render: (f) => formatWatts(f.power_output), numeric: true },
  { key: "power_erp", label: "ERP", render: (f) => formatWatts(f.power_erp), numeric: true },
  { key: "number_of_units", label: "Units", render: (f) => f.number_of_units?.toLocaleString() ?? "", numeric: true },
  { key: "date_first_used", label: "First used", render: (f) => f.date_first_used ?? "" },
]

function LocationCard({ location }: { location: DetailLocation }) {
  const n = location.location_number
  const type = locationTypeLabel(location.location_type)
  const headingId = `p90-loc-${n}`
  const columns = FREQ_COLUMNS.filter((c) => location.frequencies.some((f) => hasValue(f[c.key])))
  const hasCoords = location.latitude != null && location.longitude != null

  const fields: [string, React.ReactNode][] = []
  if (hasValue(location.location_name)) fields.push(["Site name", location.location_name])
  if (hasValue(location.address)) fields.push(["Address", location.address])
  if (hasValue(location.city)) fields.push(["City", location.city])
  if (hasValue(location.county)) fields.push(["County", location.county])
  if (hasValue(location.state)) fields.push(["State", location.state])
  if (hasCoords) {
    const lat = location.latitude!.toFixed(5)
    const lon = location.longitude!.toFixed(5)
    fields.push([
      "Coordinates",
      <a
        key="coords"
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-primary underline underline-offset-4"
      >
        {lat}, {lon}
        <span className="sr-only"> (view on map, opens in new window)</span>
      </a>,
    ])
  }
  if (location.radius != null) fields.push(["Radius of operation", `${location.radius.toLocaleString()} km`])
  if (location.corresponding_fixed_location != null)
    fields.push(["Associated fixed location", `Location ${location.corresponding_fixed_location}`])
  if (location.ground_elevation != null) fields.push(["Ground elevation", `${location.ground_elevation.toLocaleString()} m`])
  if (location.overall_structure_height != null)
    fields.push(["Structure height", `${location.overall_structure_height.toLocaleString()} m`])
  if (hasValue(location.tower_registration_number))
    fields.push(["FCC tower registration", location.tower_registration_number])

  return (
    <li>
      <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 md:p-4">
        <h4 id={headingId} className="text-base font-semibold text-foreground">
          Location {n}
          {type && <span className="font-normal text-muted-foreground"> · {type}</span>}
        </h4>

        {fields.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {fields.map(([label, value]) => (
              <Field key={label} label={label}>
                {value}
              </Field>
            ))}
          </dl>
        )}

        {location.frequencies.length > 0 && (
          <div className="flex flex-col gap-2">
            <h5 className="text-sm font-semibold text-foreground">
              Frequencies at location {n} ({location.frequencies.length})
            </h5>
            <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Frequencies licensed at location {n}</caption>
                <thead>
                  <tr className="bg-muted">
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={`px-3 py-2 font-medium text-foreground ${c.numeric ? "text-right" : "text-left"}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {location.frequencies.map((f, i) => (
                    <tr key={`${f.antenna_number}-${f.frequency_number}-${i}`} className="border-t border-border">
                      {columns.map((c, ci) =>
                        ci === 0 ? (
                          <th key={c.key} scope="row" className="px-3 py-2 text-left font-mono font-semibold text-foreground">
                            {c.render(f)}
                          </th>
                        ) : (
                          <td
                            key={c.key}
                            className={`px-3 py-2 text-muted-foreground ${c.numeric ? "text-right tabular-nums" : ""} ${
                              c.key === "station_class" ? "font-mono" : ""
                            }`}
                          >
                            {c.render(f)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-2 sm:hidden">
              {location.frequencies.map((f, i) => (
                <li key={`${f.antenna_number}-${f.frequency_number}-${i}`} className="rounded-md bg-muted p-3">
                  <p className="font-mono text-base font-semibold text-foreground">
                    {formatFrequency(f.frequency_assigned)}{" "}
                    <span className="font-sans text-sm font-normal text-muted-foreground">MHz</span>
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    {columns.slice(1).map((c) => (
                      <Field key={c.key} label={c.label}>
                        {c.render(f)}
                      </Field>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  )
}

export function Part90DetailView({ data, headingRef, backLabel, onBack }: Props) {
  const { license, locations } = data
  const [copied, setCopied] = useState(false)
  const mailingLine = [joinParts(license.mailing_city, license.mailing_state), license.mailing_zip?.slice(0, 5)]
    .filter(Boolean)
    .join(" ")

  const licenseFields: [string, string][] = []
  if (hasValue(license.frn)) licenseFields.push(["FRN", license.frn!])
  if (hasValue(license.status)) licenseFields.push(["Status", statusLabel(license.status)])
  if (hasValue(license.grant_date)) licenseFields.push(["Granted", license.grant_date!])
  if (hasValue(license.effective_date)) licenseFields.push(["Effective", license.effective_date!])
  if (hasValue(license.expiration_date)) licenseFields.push(["Expires", license.expiration_date!])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="p90-detail-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="gap-2 px-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={copyLink}>
          {copied ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Link to this license copied to clipboard" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="p90-detail-heading"
              ref={headingRef}
              tabIndex={-1}
              className="font-mono text-2xl font-bold text-primary focus:outline-none md:text-3xl"
            >
              {license.callsign}
            </h2>
            <ServiceBadge service={license.service} />
            {license.status === "A" && (
              <span className="rounded bg-muted px-2 py-0.5 text-sm font-medium text-foreground">Active</span>
            )}
          </div>
          {hasValue(license.licensee_name) && (
            <p className="text-lg font-medium text-foreground text-pretty">{license.licensee_name}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {licenseFields.length > 0 && (
            <section aria-labelledby="p90-license-heading" className="flex flex-col gap-2">
              <h3 id="p90-license-heading" className="text-sm font-semibold text-foreground">
                License
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {licenseFields.map(([label, value]) => (
                  <Field key={label} label={label}>
                    <span className={label === "FRN" ? "font-mono" : ""}>{value}</span>
                  </Field>
                ))}
              </dl>
            </section>
          )}
          {(hasValue(license.mailing_address) || mailingLine) && (
            <section aria-labelledby="p90-mailing-heading" className="flex flex-col gap-2">
              <h3 id="p90-mailing-heading" className="text-sm font-semibold text-foreground">
                Licensee mailing address
              </h3>
              <address className="text-sm not-italic text-foreground">
                {hasValue(license.mailing_address) && <span className="block">{license.mailing_address}</span>}
                {mailingLine && <span className="block">{mailingLine}</span>}
              </address>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Where the FCC sends mail for this licensee. This is not the transmitter or site location.
              </p>
            </section>
          )}
        </div>
      </div>

      <section aria-labelledby="p90-locations-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="p90-locations-heading" className="text-lg font-semibold text-foreground">
            FCC licensed locations ({locations.length})
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Where the licensed radio equipment operates. Mobile locations often have no fixed address.
          </p>
        </div>
        {locations.length === 0 ? (
          <p className="rounded-lg border border-border py-6 text-center text-muted-foreground">
            No licensed locations are listed for this license.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {locations.map((loc) => (
              <LocationCard key={loc.location_number} location={loc} />
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
