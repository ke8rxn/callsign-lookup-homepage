"use client"

import type { MouseEvent, ReactNode } from "react"
import { SERVICE_LABELS, isService } from "@/lib/part90"

export function ServiceBadge({ service }: { service: string | null | undefined }) {
  if (!service) return null
  const known = isService(service)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-sm font-medium ${
        service === "YG" ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/60" : "bg-accent/15 text-foreground ring-1 ring-inset ring-accent/60"
      }`}
      title={known ? SERVICE_LABELS[service] : undefined}
    >
      {service}
      {known && <span className="sr-only">, {SERVICE_LABELS[service]}</span>}
    </span>
  )
}

export function CallsignLink({
  callsign,
  href,
  onOpen,
  className = "",
}: {
  callsign: string
  href: string
  onOpen: (callsign: string) => void
  className?: string
}) {
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        onOpen(callsign)
      }}
      className={`rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {callsign}
      <span className="sr-only">, view license details</span>
    </a>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function ServiceLegend() {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      <span className="font-medium text-foreground">IG</span> {SERVICE_LABELS.IG}
      <span aria-hidden="true"> · </span>
      <span className="sr-only">. </span>
      <span className="font-medium text-foreground">YG</span> {SERVICE_LABELS.YG}
    </p>
  )
}
