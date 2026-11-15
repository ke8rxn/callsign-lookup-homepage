"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field } from "@/components/part90/part90-shared"
import { FREQ_COLUMNS, LocationCard } from "@/components/part90/part90-detail"
import {
  buildDetailUrl,
  hasValue,
  joinParts,
  part90Fetcher,
  type Part90Detail,
  type Part90Error,
} from "@/lib/part90"

type PopupKind = "locations" | "frequencies"

interface Props {
  kind: PopupKind
  callsign: string
  licensee?: string | null
  count: number | null | undefined
  onOpenDetail: (callsign: string) => void
}

const SWR_OPTIONS = { revalidateOnFocus: false, shouldRetryOnError: false }

export function Part90LicensePopup({ kind, callsign, licensee, count, onOpenDetail }: Props) {
  const [open, setOpen] = useState(false)
  const { data, error, isLoading } = useSWR<Part90Detail, Part90Error>(
    open ? buildDetailUrl(callsign) : null,
    part90Fetcher,
    SWR_OPTIONS,
  )

  if (count == null) return null
  const noun = kind === "locations" ? "licensed location" : "frequency record"
  const label = `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`
  const title = kind === "locations" ? "FCC licensed locations" : "Frequency records"
  const idPrefix = `p90-pop-${kind}-${callsign}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={count === 0}
          className="rounded px-1 font-medium tabular-nums text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
        >
          {count.toLocaleString()}
          <span className="sr-only">
            {" "}
            {noun}
            {count === 1 ? "" : "s"} for {callsign}, show details
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-primary">{callsign}</span>
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>
            {[licensee, label].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div aria-busy={isLoading} className="flex flex-col gap-3">
          <p className="sr-only" role="status" aria-live="polite">
            {isLoading ? `Loading ${title.toLowerCase()} for ${callsign}.` : data ? `${label} loaded.` : ""}
          </p>
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>Loading…</span>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error.message}
            </p>
          )}
          {data &&
            (kind === "locations" ? (
              <LocationsBody data={data} idPrefix={idPrefix} />
            ) : (
              <FrequenciesBody data={data} callsign={callsign} />
            ))}
        </div>

        {data && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenDetail(callsign)
              }}
              className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              View full license for {callsign}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LocationsBody({ data, idPrefix }: { data: Part90Detail; idPrefix: string }) {
  if (data.locations.length === 0)
    return <p className="py-6 text-center text-muted-foreground">No licensed locations are listed for this license.</p>
  return (
    <ul className="flex flex-col gap-3">
      {data.locations.map((loc) => (
        <LocationCard key={loc.location_number} location={loc} idPrefix={idPrefix} headingLevel={3} />
      ))}
    </ul>
  )
}

function FrequenciesBody({ data, callsign }: { data: Part90Detail; callsign: string }) {
  const rows = data.locations.flatMap((loc) =>
    loc.frequencies.map((f) => ({
      ...f,
      locationLabel: [`Location ${loc.location_number}`, joinParts(loc.city, loc.county ? `${loc.county} County` : null, loc.state)]
        .filter(Boolean)
        .join(": "),
    })),
  )
  if (rows.length === 0)
    return <p className="py-6 text-center text-muted-foreground">No frequency records are listed for this license.</p>

  const columns = FREQ_COLUMNS.filter((c) => rows.some((f) => hasValue(f[c.key])))
  const [first, ...rest] = columns

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Frequency records for {callsign}</caption>
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium text-foreground">{first.label}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-foreground">FCC licensed location</th>
              {rest.map((c) => (
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
            {rows.map((f, i) => (
              <tr key={`${f.locationLabel}-${f.antenna_number}-${f.frequency_number}-${i}`} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 text-left font-mono font-semibold text-foreground whitespace-nowrap">
                  {first.render(f)}
                </th>
                <td className="px-3 py-2 text-muted-foreground">{f.locationLabel}</td>
                {rest.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-muted-foreground ${c.numeric ? "text-right tabular-nums whitespace-nowrap" : ""} ${
                      c.key === "station_class" ? "font-mono" : ""
                    }`}
                  >
                    {c.render(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((f, i) => (
          <li key={`${f.locationLabel}-${f.antenna_number}-${f.frequency_number}-${i}`} className="rounded-md bg-muted p-3">
            <p className="font-mono text-base font-semibold text-foreground">
              {first.render(f)} <span className="font-sans text-sm font-normal text-muted-foreground">MHz</span>
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <Field label="FCC licensed location">{f.locationLabel}</Field>
              {rest.map((c) => (
                <Field key={c.key} label={c.label}>
                  {c.render(f)}
                </Field>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
