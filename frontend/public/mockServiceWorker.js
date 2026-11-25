/* eslint-disable */
/* tslint:disable */

/**
 * Mock Service Worker (1.3.2).
 * @see https://github.com/mswjs/msw
 * - Please do NOT modify this file.
 * - Please do NOT serve this file on production.
 */

const INTEGRITY_CHECKSUM = '3d6b9f06410d179a7f7404d4bf4c3c70'
const IS_MOCKED_RESPONSE = Symbol('isMockedResponse')
const activeClientIds = new Set()

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', async function (event) {
  const clientId = event.source.id

  if (!clientId || !self.clients) {
    return
  }

  const client = await self.clients.get(clientId)

  if (!client) {
    return
  }

  const allClients = await self.clients.matchAll({
    type: 'window',
  })

  switch (event.data && event.data.type) {
    case 'KEEPALIVE_REQUEST': {
      sendToClient(client, {
        type: 'KEEPALIVE_RESPONSE',
      })
      break
    }

    case 'INTEGRITY_CHECK_REQUEST': {
      sendToClient(client, {
        type: 'INTEGRITY_CHECK_RESPONSE',
        payload: INTEGRITY_CHECKSUM,
      })
      break
    }

    case 'MOCK_ACTIVATE': {
      activeClientIds.add(clientId)

      sendToClient(client, {
        type: 'MOCKING_ENABLED',
      })
      break
    }

    case 'MOCK_DEACTIVATE': {
      activeClientIds.delete(clientId)
      break
    }

    case 'CLIENT_CLOSED': {
      activeClientIds.delete(clientId)

      const remainingClients = allClients.filter((client) => {
        return client.id !== clientId
      })

      // Unregister itself when there are no more clients
      if (remainingClients.length === 0) {
        self.registration.unregister()
      }

      break
    }
  }
})

self.addEventListener('fetch', function (event) {
  const { request } = event
  const accept = request.headers.get('accept') || ''

  // Bypass server-sent events.
  if (accept.includes('text/event-stream')) {
    return
  }

  // Bypass navigation requests.
  if (request.mode === 'navigate') {
    return
  }

  // Opening the DevTools triggers the "only-if-cached" request
  // that cannot be handled by the worker. Bypass such requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return
  }

  // Bypass all requests when there are no active clients.
  // Prevents the self-unregistered worked from handling requests
  // after it's been deleted (still remains active until the next reload).
  if (activeClientIds.size === 0) {
    return
  }

  // Generate unique request ID.
  const requestId = Math.random().toString(16).slice(2)

  event.respondWith(
    handleRequest(event, requestId).catch((error) => {
      if (error.name === 'NetworkError') {
        console.warn(
          'Bypass a network request in "%s" because the request failed to complete.',
          request.url,
        )
        return
      }

      // Re-throw all other errors.
      throw error
    }),
  )
})

async function handleRequest(event, requestId) {
  const client = await resolveMainClient(event)
  const response = await getResponse(event, client, requestId)

  // Send back the response clone for the "response:*" life-cycle events.
  // Ensure MSW is active and ready to handle the message, otherwise
  // this message will pend indefinitely.
  if (client && activeClientIds.has(client.id)) {
    ;(async function () {
      const clonedResponse = response.clone()
      sendToClient(client, {
        type: 'RESPONSE',
        payload: {
          requestId,
          type: clonedResponse.type,
          ok: clonedResponse.ok,
          status: clonedResponse.status,
          statusText: clonedResponse.statusText,
          body:
            clonedResponse.body === null ? null : await clonedResponse.text(),
          headers: Object.fromEntries(clonedResponse.headers.entries()),
          redirected: clonedResponse.redirected,
        },
      })
    })()
  }

  return response
}

// Resolve the "main" client for the given event.
// Client that issues a request doesn't necessarily equal the client
// that registered the worker. It's with the latter the worker should
// communicate with during the response resolution.
async function resolveMainClient(event) {
  const url = new URL(event.request.url)

  // If the worker was registered for a specific scope, ensure that
  // the client requesting the resource is within that scope.
  if (url.origin !== self.location.origin) {
    return
  }

  const existingClients = await self.clients.matchAll({
    type: 'window',
  })

  return existingClients.find((client) => {
    // Get the client ID from the request URL or headers.
    const clientUrl = new URL(client.url)

    // If the client is on a different origin to the application,
    // there's nothing we can do.
    if (clientUrl.origin !== self.location.origin) {
      return false
    }

    // Ensure the target client is a valid client.
    // Reading the client's `frameType` in Firefox throws an error.
    // Apparently, it's a known issue: https://bugzilla.mozilla.org/show_bug.cgi?id=1313167
    if (client.frameType) {
      return client.frameType === 'top-level'
    }

    // If the client is based on the same origin, it's the target client.
    // This approach is Chromium-based browsers exclusive.
    return true
  })
}

async function getResponse(event, client, requestId) {
  const { request } = event
  const clonedRequest = request.clone()

  function passthrough() {
    // Clone the request because it might've been already used
    // (i.e. its body has been read and sent to the client).
    const headers = Object.fromEntries(clonedRequest.headers.entries())

    // Remove MSW-specific request headers so the bypassed requests
    // comply with the server's CORS preflight check.
    // Operate with the headers as an object because request "Headers"
    // are immutable.
    delete headers['x-msw-bypass']

    return fetch(clonedRequest, { headers })
  }

  // Bypass mocking when the client is not active.
  if (!client) {
    return passthrough()
  }

  // Bypass initial page load requests (i.e. static assets).
  // The absence of the immediate/parent client in the map of the active clients
  // means that MSW hasn't dispatched the "MOCK_ACTIVATE" event yet
  // and is not ready to handle requests.
  if (!activeClientIds.has(client.id)) {
    return passthrough()
  }

  // Bypass requests with the explicit bypass header.
  // Such requests can be issued by "ctx.fetch()".
  if (request.headers.get('x-msw-bypass') === 'true') {
    return passthrough()
  }

  // Notify the client that a request has been intercepted.
  const clientMessage = await sendToClient(client, {
    type: 'REQUEST',
    payload: {
      id: requestId,
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      cache: request.cache,
      mode: request.mode,
      credentials: request.credentials,
      destination: request.destination,
      integrity: request.integrity,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      body: await request.text(),
      bodyUsed: request.bodyUsed,
      keepalive: request.keepalive,
    },
  })

  switch (clientMessage.type) {
    case 'MOCK_RESPONSE': {
      return respondWithMock(clientMessage.data)
    }

    case 'MOCK_NOT_FOUND': {
      return passthrough()
    }

    case 'NETWORK_ERROR': {
      const { name, message } = clientMessage.data
      const networkError = new Error(message)
      networkError.name = name

      // Rejecting a "respondWith" promise is going to
      // cause the request to be aborted.
      throw networkError
    }
  }

  return passthrough()
}

function sendToClient(client, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()

    channel.port1.onmessage = function (event) {
      if (event.data && event.data.error) {
        return reject(event.data.error)
      }

      resolve(event.data)
    }

    client.postMessage(message, [channel.port2])
  })
}

function sleep(timeMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeMs)
  })
}

async function respondWithMock(response) {
  await sleep(response.delay)
  return new Response(response.body, response)
}
