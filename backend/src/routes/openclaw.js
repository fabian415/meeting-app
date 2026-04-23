import express from 'express'
import {
  createScopedSessionId,
  getDefaultSessionId,
  getOpenClawHistory,
  initializeOpenClawSession,
  probeOpenClawGateway,
  sendOpenClawMessage,
  smokeTestOpenClaw,
} from '../services/openclawService.js'

const router = express.Router()

router.get('/probe', async (_req, res) => {
  try {
    const result = await probeOpenClawGateway()
    return res.json(result)
  } catch (error) {
    console.error('[Openclaw Probe Error]', error.message)
    return res.status(500).json({
      success: false,
      connected: false,
      message: error.message || 'Failed to probe OpenClaw Gateway',
    })
  }
})

router.get('/history', async (req, res) => {
  try {
    const sessionId = typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
      ? req.query.sessionId.trim()
      : getDefaultSessionId()

    const messages = await getOpenClawHistory({ sessionId })
    return res.json({ success: true, sessionId, messages })
  } catch (error) {
    console.error('[Openclaw History Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load OpenClaw history',
    })
  }
})

router.post('/smoke', async (req, res) => {
  try {
    const message = req.body?.message || '請回覆：Gateway smoke test success'
    const result = await smokeTestOpenClaw({ message })
    return res.json(result)
  } catch (error) {
    console.error('[Openclaw Smoke Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to run OpenClaw smoke test',
    })
  }
})

router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId = null, context = {} } = req.body || {}

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing chat message' })
    }

    const result = await sendOpenClawMessage({ message, sessionId, context })
    return res.json(result)
  } catch (error) {
    console.error('[Openclaw Chat Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message to OpenClaw',
    })
  }
})

router.post('/session', async (req, res) => {
  try {
    const { scope = 'meeting', context = {} } = req.body || {}
    const sessionId = createScopedSessionId(scope)
    const session = await initializeOpenClawSession({ sessionId })

    return res.json({
      success: true,
      sessionId,
      context: {
        ...(context && typeof context === 'object' ? context : {}),
        sessionId,
        hiddenMessageIds: session.hiddenMessageIds || [],
      },
    })
  } catch (error) {
    console.error('[Openclaw Session Error]', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to start a new OpenClaw session',
    })
  }
})

export default router
