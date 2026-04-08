import { randomUUID } from 'node:crypto'

const PROTOCOL_VERSION = 3
const DEFAULT_HISTORY_LIMIT = 100
const POLL_INTERVAL_MS = 1200
const DEFAULT_WAIT_TIMEOUT_MS = 45000
const DEFAULT_AGENT_ID = (process.env.OPENCLAW_DEFAULT_AGENT_ID || 'main').trim()
const DEFAULT_NEW_SESSION_COMMAND = (process.env.OPENCLAW_NEW_SESSION_COMMAND || '/new').trim()

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getDefaultSessionId() {
  return `agent:${DEFAULT_AGENT_ID}:main`
}

export function createScopedSessionId(scope = 'meeting') {
  const safeScope = String(scope).replace(/[^a-zA-Z0-9_-]/g, '-')
  return `agent:${DEFAULT_AGENT_ID}:${safeScope}:${Date.now()}-${randomUUID().slice(0, 8)}`
}

function buildGatewayUrl() {
  const rawUrl = (process.env.OPENCLAW_GATEWAY_URL || '').trim()
  if (!rawUrl) throw new Error('OPENCLAW_GATEWAY_URL is not configured')

  if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) return rawUrl
  if (rawUrl.startsWith('http://')) return `ws://${rawUrl.slice('http://'.length)}`
  if (rawUrl.startsWith('https://')) return `wss://${rawUrl.slice('https://'.length)}`
  return `ws://${rawUrl}`
}

function buildConnectParams() {
  const auth = {}
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim()
  const password = process.env.OPENCLAW_GATEWAY_PASSWORD?.trim()

  if (token) auth.token = token
  if (password) auth.password = password

  return {
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    client: {
      id: 'cli',
      version: '1.0.0',
      platform: process.platform === 'win32' ? 'windows' : process.platform,
      mode: 'cli',
    },
    role: 'operator',
    scopes: ['operator.read', 'operator.write'],
    auth,
    locale: 'zh-TW',
    userAgent: 'meeting-recorder-app/1.0.0',
  }
}

function pickText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (value && typeof value === 'object') {
    return pickText(
      value.text
      || value.content
      || value.body
      || value.message
      || value.displayText
      || value.output
      || value.value,
    )
  }
  return ''
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isThoughtEntry(entry) {
  const typeHints = [
    entry?.kind,
    entry?.type,
    entry?.channel,
    entry?.category,
    entry?.subtype,
    entry?.message?.kind,
    entry?.message?.type,
    entry?.message?.channel,
    entry?.metadata?.kind,
    entry?.metadata?.type,
    entry?.metadata?.phase,
    entry?.metadata?.channel,
  ]
    .map(normalizeString)
    .filter(Boolean)

  const thoughtTypes = new Set([
    'analysis',
    'chain_of_thought',
    'internal_reasoning',
    'internal_thought',
    'reasoning',
    'thinking',
    'thought',
  ])

  if (typeHints.some(value => thoughtTypes.has(value))) return true

  const visibilityHints = [
    entry?.visibility,
    entry?.message?.visibility,
    entry?.metadata?.visibility,
  ]
    .map(normalizeString)
    .filter(Boolean)

  if (visibilityHints.some(value => ['hidden', 'internal', 'private'].includes(value))) return true

  return false
}

function isProcessEntry(entry, role) {
  const normalizedRole = normalizeString(role)
  if (['tool', 'toolresult', 'function', 'functionresult'].includes(normalizedRole)) return true

  const typeHints = [
    entry?.kind,
    entry?.type,
    entry?.channel,
    entry?.category,
    entry?.subtype,
    entry?.message?.kind,
    entry?.message?.type,
    entry?.message?.channel,
    entry?.metadata?.kind,
    entry?.metadata?.type,
    entry?.metadata?.phase,
    entry?.metadata?.channel,
  ]
    .map(normalizeString)
    .filter(Boolean)

  if (typeHints.some(value => ['tool', 'tool_call', 'tool_result', 'command', 'event', 'status'].includes(value))) {
    return true
  }

  return false
}

function splitMixedMessage(message) {
  if (!message?.content || typeof message.content !== 'string') return [message]
  if (message.role !== 'user' && message.role !== 'assistant') return [message]

  const lines = message.content.split('\n')
  if (!lines[0]?.trim().startsWith('System:')) return [message]

  const actualMessageStartIndex = lines.findIndex((line, index) => (
    index > 0
    && /^\[[^\]]+\]/.test(line.trim())
  ))

  if (actualMessageStartIndex === -1) return [message]

  const systemContent = lines.slice(0, actualMessageStartIndex).join('\n').trim()
  const actualContent = lines.slice(actualMessageStartIndex).join('\n').trim()

  if (!systemContent || !actualContent) return [message]

  return [
    {
      ...message,
      id: `${message.id}-system`,
      role: 'system',
      content: systemContent,
      isProcess: true,
    },
    {
      ...message,
      id: `${message.id}-user`,
      content: actualContent,
    },
  ]
}

function normalizeHistoryPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.messages || payload?.entries || payload?.items || payload?.history || []

  return list
    .map((entry, index) => {
      const role = entry?.role
        || entry?.message?.role
        || entry?.author?.role
        || entry?.kind
        || 'assistant'
      const isThought = isThoughtEntry(entry)
      const isProcess = isProcessEntry(entry, role)

      const content = pickText(
        entry?.content
        || entry?.message?.content
        || entry?.text
        || entry?.body
        || entry?.message
        || entry?.displayText,
      )

      return {
        id: entry?.id || entry?.messageId || `msg-${index}`,
        role,
        content,
        createdAt: entry?.createdAt || entry?.ts || entry?.timestamp || null,
        isThought,
        isProcess,
        type: entry?.type || entry?.kind || entry?.message?.type || entry?.message?.kind || null,
        visibility: entry?.visibility || entry?.message?.visibility || entry?.metadata?.visibility || null,
      }
    })
    .filter(message => message.content)
    .flatMap(splitMixedMessage)
}

function conversationSignature(messages) {
  return JSON.stringify(messages.map(message => [
    message.role,
    message.content,
    Boolean(message.isThought),
    Boolean(message.isProcess),
  ]))
}

function getLastAssistantReply(messages) {
  return [...messages].reverse().find(message => (
    message.role === 'assistant'
    && !message.isThought
    && !message.isProcess
  ))?.content || ''
}

class OpenClawGatewayClient {
  constructor() {
    this.socket = null
    this.connectPromise = null
    this.pending = new Map()
    this.isReady = false
  }

  async ensureConnected() {
    if (this.isReady && this.socket?.readyState === WebSocket.OPEN) return
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = this.connect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  async connect() {
    const url = buildGatewayUrl()

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const connectId = randomUUID()
      let settled = false
      let challengeReceived = false

      const cleanup = () => {
        ws.removeEventListener('message', onMessage)
        ws.removeEventListener('close', onClose)
        ws.removeEventListener('error', onError)
      }

      const fail = (error) => {
        if (settled) return
        settled = true
        cleanup()
        try { ws.close() } catch {}
        reject(error)
      }

      const succeed = () => {
        if (settled) return
        settled = true
        cleanup()
        this.socket = ws
        this.isReady = true
        this.bindSocket(ws)
        resolve()
      }

      const sendConnect = () => {
        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: buildConnectParams(),
        }))
      }

      const onMessage = (event) => {
        let packet
        try {
          packet = JSON.parse(String(event.data))
        } catch {
          return
        }

        if (packet?.type === 'event' && packet?.event === 'connect.challenge') {
          challengeReceived = true
          sendConnect()
          return
        }

        if (packet?.type === 'res' && packet?.id === connectId) {
          if (packet.ok) succeed()
          else fail(new Error(packet?.error?.message || 'OpenClaw Gateway connect failed'))
        }
      }

      const onClose = () => fail(new Error('OpenClaw Gateway connection closed during handshake'))
      const onError = () => fail(new Error('OpenClaw Gateway connection error'))

      ws.addEventListener('message', onMessage)
      ws.addEventListener('close', onClose)
      ws.addEventListener('error', onError)
      ws.addEventListener('open', () => {
        setTimeout(() => {
          if (!settled && !challengeReceived) sendConnect()
        }, 300)
      }, { once: true })
    })
  }

  bindSocket(ws) {
    ws.addEventListener('message', (event) => {
      let packet
      try {
        packet = JSON.parse(String(event.data))
      } catch {
        return
      }

      if (packet?.type === 'res' && packet?.id) {
        const pending = this.pending.get(packet.id)
        if (!pending) return

        this.pending.delete(packet.id)
        clearTimeout(pending.timer)

        if (packet.ok) pending.resolve(packet.payload)
        else pending.reject(new Error(packet?.error?.message || `${pending.method} failed`))
      }
    })

    ws.addEventListener('close', () => {
      this.isReady = false
      this.socket = null
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('OpenClaw Gateway connection closed'))
      }
      this.pending.clear()
    })

    ws.addEventListener('error', () => {
      this.isReady = false
    })
  }

  async call(method, params = {}, timeoutMs = 15000) {
    await this.ensureConnected()

    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer, method })

      this.socket.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }))
    })
  }
}

const gatewayClient = new OpenClawGatewayClient()

export async function probeOpenClawGateway() {
  await gatewayClient.ensureConnected()

  const health = await gatewayClient.call('health', {}, 10000).catch(error => ({
    ok: false,
    error: error.message,
  }))

  const status = await gatewayClient.call('status', {}, 10000).catch(error => ({
    ok: false,
    error: error.message,
  }))

  return {
    success: true,
    connected: true,
    gatewayUrl: buildGatewayUrl(),
    authMode: process.env.OPENCLAW_GATEWAY_TOKEN?.trim()
      ? 'token'
      : process.env.OPENCLAW_GATEWAY_PASSWORD?.trim()
        ? 'password'
        : 'none',
    defaultSessionId: getDefaultSessionId(),
    health,
    status,
  }
}

export async function getOpenClawHistory({ sessionId, limit = DEFAULT_HISTORY_LIMIT }) {
  if (!sessionId) throw new Error('sessionId is required')

  const payload = await gatewayClient.call('chat.history', {
    sessionKey: sessionId,
    limit,
  })

  return normalizeHistoryPayload(payload)
}

async function waitForConversationUpdate({ sessionId, previousMessages, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS }) {
  const previousSignature = conversationSignature(previousMessages)
  const startedAt = Date.now()
  let latestMessages = previousMessages

  while (Date.now() - startedAt < timeoutMs) {
    latestMessages = await getOpenClawHistory({ sessionId })
    const nextSignature = conversationSignature(latestMessages)
    const hasAssistantReply = getLastAssistantReply(latestMessages)

    if (nextSignature !== previousSignature && hasAssistantReply) {
      return latestMessages
    }

    await delay(POLL_INTERVAL_MS)
  }

  return latestMessages
}

export async function sendOpenClawMessage({ message, sessionId = null, context = {} }) {
  const effectiveSessionId = sessionId || context.sessionId || getDefaultSessionId()
  const previousMessages = await getOpenClawHistory({ sessionId: effectiveSessionId }).catch(() => [])

  await gatewayClient.call('chat.send', {
    sessionKey: effectiveSessionId,
    message,
    idempotencyKey: randomUUID(),
  }, DEFAULT_WAIT_TIMEOUT_MS)

  const messages = await waitForConversationUpdate({
    sessionId: effectiveSessionId,
    previousMessages,
  })

  return {
    success: true,
    sessionId: effectiveSessionId,
    messages,
    reply: getLastAssistantReply(messages),
  }
}

export async function startOpenClawConversation({ initialMessage, context = {} }) {
  return sendOpenClawMessage({
    message: initialMessage,
    sessionId: context.sessionId || null,
    context,
  })
}

export async function smokeTestOpenClaw({ message }) {
  const sessionId = getDefaultSessionId()
  const result = await sendOpenClawMessage({
    message,
    sessionId,
    context: { sessionId },
  })

  return {
    success: true,
    sessionId,
    reply: result.reply,
    messages: result.messages,
  }
}

export async function initializeOpenClawSession({ sessionId }) {
  const targetSessionId = sessionId || createScopedSessionId('meeting')
  const result = await sendOpenClawMessage({
    message: DEFAULT_NEW_SESSION_COMMAND,
    sessionId: targetSessionId,
    context: { sessionId: targetSessionId },
  })

  return {
    success: true,
    sessionId: targetSessionId,
    hiddenMessageIds: (result.messages || []).map(message => message.id).filter(Boolean),
  }
}
