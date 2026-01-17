import { Context } from 'hono'

// Allowed proxy targets
const ALLOWED_TARGETS: Record<string, string> = {
  'trading-api': 'https://trading-api-labs.interface.gateway.uniswap.org',
  'graphql': 'https://beta.gateway.uniswap.org',
  'gateway': 'https://interface.gateway.uniswap.org',
  'amplitude': 'https://metrics.interface.gateway.uniswap.org',
  'trade-api': 'https://trade-api.gateway.uniswap.org',
  'beta': 'https://beta.gateway.uniswap.org',
  'entry-gateway': 'https://entry-gateway.backend-prod.api.uniswap.org',
}

// Headers to forward from client
const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'x-api-key',
  'x-request-id',
  'x-request-source',
  'authorization',
]

// Headers to copy from upstream response
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
]

export async function proxyHandler(c: Context): Promise<Response> {
  const target = c.req.param('target')
  // Get the full path after the target - handle wildcard properly
  const url = new URL(c.req.url)
  const pathMatch = url.pathname.match(/^\/api\/proxy\/[^\/]+\/(.*)$/)
  const path = pathMatch ? pathMatch[1] : ''
  
  const baseUrl = ALLOWED_TARGETS[target]
  if (!baseUrl) {
    console.error(`Invalid proxy target: ${target}`)
    return c.json({ error: `Invalid proxy target: ${target}` }, 400)
  }

  // Build the target URL
  const targetUrl = `${baseUrl}/${path}${url.search}`
  console.log(`Proxying ${c.req.method} request to: ${targetUrl}`)

  // Prepare headers for the upstream request
  const headers = new Headers()
  headers.set('Origin', 'https://app.uniswap.org')
  headers.set('Referer', 'https://app.uniswap.org/')
  headers.set('User-Agent', 'Mozilla/5.0 (compatible; UniswapInterface/1.0)')
  
  // Forward allowed headers from client
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = c.req.header(header)
    if (value) {
      headers.set(header, value)
    }
  }

  try {
    // Make the upstream request
    const upstreamResponse = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' 
        ? await c.req.raw.clone().text() 
        : undefined,
    })

    // Build response headers
    const responseHeaders = new Headers()
    
    // Add CORS headers for your domain
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Request-Id')
    responseHeaders.set('Access-Control-Max-Age', '86400')

    // Forward allowed response headers
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(header)
      if (value) {
        responseHeaders.set(header, value)
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return c.json({ error: 'Proxy request failed' }, 502)
  }
}

export async function proxyOptionsHandler(c: Context): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Request-Id',
      'Access-Control-Max-Age': '86400',
    },
  })
}
