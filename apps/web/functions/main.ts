import { poolImageHandler } from 'functions/api/image/pools'
import { tokenImageHandler } from 'functions/api/image/tokens'
import { proxyHandler, proxyOptionsHandler } from 'functions/api/proxy'
import { metaTagInjectionMiddleware } from 'functions/components/metaTagInjector'
import { Context, Hono } from 'hono'
import { cache } from 'hono/cache'

type Bindings = {
  ASSETS: {
    fetch: typeof fetch
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// Proxy routes for bypassing CORS - must be before other routes
app.options('/api/proxy/:target/*', proxyOptionsHandler)
app.options('/api/proxy/:target', proxyOptionsHandler)
app.all('/api/proxy/:target/*', proxyHandler)
app.all('/api/proxy/:target', proxyHandler)

app.get(
  '/api/image/tokens/:networkName/:tokenAddress',
  cache({
    cacheName: 'token-images',
    cacheControl: 'max-age=604800', // 1 week
  }),
  tokenImageHandler,
)

app.get(
  '/api/image/pools/:networkName/:poolAddress',
  cache({
    cacheName: 'pool-images',
    cacheControl: 'max-age=604800', // 1 week
  }),
  poolImageHandler,
)

app.all('*', async (c: Context) => {
  const url = new URL(c.req.url)

  // Serve static files (SPA) - fallback to ASSETS binding
  const next = async () => {
    const response = await c.env.ASSETS.fetch(c.req.raw)
    c.res = response
  }

  // API routes should not be processed by meta tag injection
  if (url.pathname.startsWith('/api/')) {
    return await next()
  }

  // For non-API routes, use meta tag injection middleware
  return metaTagInjectionMiddleware(c, next)
})

// eslint-disable-next-line import/no-unused-modules
export default app
