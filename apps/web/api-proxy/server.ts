import cors from '@fastify/cors'
import Fastify from 'fastify'

const fastify = Fastify({ logger: true })

// Enable CORS
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'X-Request-Source'],
})

// Allowed proxy targets
const ALLOWED_TARGETS: Record<string, string> = {
  'trading-api': 'https://trading-api-labs.interface.gateway.uniswap.org',
  graphql: 'https://beta.gateway.uniswap.org',
  gateway: 'https://interface.gateway.uniswap.org',
  amplitude: 'https://metrics.interface.gateway.uniswap.org',
  'trade-api': 'https://trade-api.gateway.uniswap.org',
  beta: 'https://beta.gateway.uniswap.org',
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

// Proxy handler
fastify.all('/api/proxy/:target/*', async (request, reply) => {
  const { target } = request.params as { target: string }
  const wildcardPath = (request.params as { '*': string })['*'] || ''

  const baseUrl = ALLOWED_TARGETS[target]
  if (!baseUrl) {
    return reply.status(400).send({ error: `Invalid proxy target: ${target}` })
  }

  // Build target URL
  const queryString = request.url.includes('?') ? request.url.split('?')[1] : ''
  const targetUrl = `${baseUrl}/${wildcardPath}${queryString ? '?' + queryString : ''}`

  // Build headers
  const headers: Record<string, string> = {
    Origin: 'https://app.uniswap.org',
    Referer: 'https://app.uniswap.org/',
    'User-Agent': 'Mozilla/5.0 (compatible; UniswapInterface/1.0)',
  }

  // Forward allowed headers
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[header]
    if (value && typeof value === 'string') {
      headers[header] = value
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(request.method) ? JSON.stringify(request.body) : undefined,
    })

    const data = await response.text()

    // Try to parse as JSON, otherwise return as-is
    try {
      const jsonData = JSON.parse(data)
      return reply.status(response.status).header('Content-Type', 'application/json').send(jsonData)
    } catch {
      return reply
        .status(response.status)
        .header('Content-Type', response.headers.get('content-type') || 'text/plain')
        .send(data)
    }
  } catch (error) {
    return reply.status(502).send({ error: 'Proxy request failed', details: String(error) })
  }
})

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' })
    fastify.log.info('Proxy server running on http://0.0.0.0:3001')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
