import { createServer } from 'node:http'
import { handleGradesRoute } from './routes/grades.js'
import { handleSearchRoute } from './routes/search.js'
import { sendError, sendJson } from './utils/http.js'

const port = Number(process.env.PORT || 8787)

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendError(response, 400, 'Missing request URL.')
    return
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url, `http://${request.headers.host}`)

  try {
    if (request.method === 'GET' && url.pathname === '/api/search') {
      const result = await handleSearchRoute(url)
      sendJson(response, result.statusCode, result.payload)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/grades') {
      const result = await handleGradesRoute(url)
      sendJson(response, result.statusCode, result.payload)
      return
    }

    sendError(response, 404, 'Route not found.')
  } catch (error) {
    sendError(response, 500, error.message || 'Unexpected server error.')
  }
})

server.listen(port, () => {
  console.log(`Accessibility Map API listening on http://localhost:${port}`)
})
