// Unknown /api paths would otherwise fall through to the static HTML 404 page,
// which Vercel serves with a wildcard Access-Control-Allow-Origin. Answering
// them here keeps every /api response a JSON function response with no CORS header.
function notFound() {
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = notFound
export const HEAD = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const OPTIONS = notFound
