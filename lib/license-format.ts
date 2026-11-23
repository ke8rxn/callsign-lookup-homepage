export interface CallsignRecord {
  usid: string
  callsign: string
  status: string
  service: string // "HA"/"HV" = Amateur Radio, "ZA" = GMRS
  name: string
  street: string
  city: string
  state: string
  zip: string
  frn: string
  class: string | null // License class (E, G, T, etc.) - only for Amateur
  prevcall: string | null
}

// Convert "Last, First" to "First Last"
export function formatName(name: string): string {
  if (!name) return "Name not available"
  const parts = name.split(",").map(part => part.trim())
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`
  }
  return name
}

// Check if service code is Amateur Radio (HA = Amateur, HV = Vanity)
export function isAmateurRadio(service: string): boolean {
  return service === "HA" || service === "HV"
}

// Convert license class abbreviation to full name
export function formatLicenseClass(classAbbr: string | null): string {
  if (!classAbbr) return ""
  const classMap: Record<string, string> = {
    "E": "Extra",
    "G": "General",
    "T": "Tech",
    "A": "Advanced",
    "N": "Novice",
    "P": "Tech Plus",
  }
  return classMap[classAbbr.toUpperCase()] || classAbbr
}

// Format concatenated street address: "3869NordicAve" -> "3869 Nordic Ave"
export function formatStreet(street: string): string {
  let s = (street ?? "").trim()
  if (!s) return "Street not available"

  // FCC data strips the "PO BOX" prefix, so a bare number is a PO Box.
  if (/^\d+$/.test(s)) return `PO Box ${s}`
  s = s.replace(/^(?:P\.?\s*O\.?\s*Box|PostOfficeBox|Box)\s*#?\s*(\d[\w-]*)/i, "PO Box $1")

  // Matching is case-sensitive on purpose: a case-insensitive "se"/"st" would
  // split real words ("Melrose" -> "Melro SE", "Forest" -> "Fore St").
  let trailingDirection = ""
  const dirMatch = s.match(/(?<=[a-z\d\s])(NW|NE|SW|SE)$/) ?? s.match(/(?<=[a-z\s])([NSEW])$/)
  if (dirMatch) {
    trailingDirection = dirMatch[1]
    s = s.slice(0, -trailingDirection.length)
  }

  s = s.replace(/([A-Za-z0-9])#/g, "$1 #")

  // House number, keeping an ordinal street together: "1241140thAve" -> "1241 140thAve"
  const ordinal = s.match(/^(\d+?)(\d{1,3}(?:st|nd|rd|th))(?=[A-Z])/)
  if (ordinal) {
    s = `${ordinal[1]} ${s.slice(ordinal[0].length - ordinal[2].length)}`
  } else {
    s = s.replace(/^(\d+)(?=[A-Za-z])/, "$1 ")
  }

  // Leading directional after the house number: "789 N1stSt" -> "789 N 1stSt"
  s = s.replace(/^(\d+\s+)(NE|NW|SE|SW|[NSEW])(?=\d|[A-Z][a-z])/, "$1$2 ")

  s = s.replace(/\b(\d+(?:st|nd|rd|th))(?=[A-Z])/g, "$1 ")

  const streetTypes = [
    "Boulevard", "Crossing", "Highway", "Parkway", "Terrace", "Avenue", "Circle", "Street", "Square",
    "Court", "Drive", "Place", "Plaza", "Trail", "Lane", "Loop", "Pike", "Road", "Way", "Row",
    "Blvd", "Pkwy", "Xing", "Ave", "Cir", "Hwy", "Plz", "Ter", "Trl", "Ct", "Dr", "Ln", "Pl", "Rd", "Sq", "St",
  ]
  for (const type of streetTypes) {
    const re = new RegExp(`([a-z0-9])(${type})$`)
    if (re.test(s)) {
      s = s.replace(re, "$1 $2")
      break
    }
  }

  s = s.replace(/([a-z])([A-Z])/g, "$1 $2")
  s = s.replace(/\b(Ma?c) (?=[A-Z][a-z])/g, "$1")
  s = s.replace(/\b(Hwy|Highway|Route|Rte|Rt)(\d)/g, "$1 $2")

  // Units: "Apt#10", "Suite110", "Ste 5" -> "Apt 10", "Suite 110", "Ste 5"
  s = s.replace(
    /\b(Apt|Apartment|Suite|Ste|Unit|Rm|Room|Bldg|Lot|Trlr)\.?\s*#?\s*(\d[\w-]*)/g,
    "$1 $2",
  )

  if (trailingDirection) s = `${s} ${trailingDirection}`
  return s.replace(/\s+/g, " ").trim()
}
