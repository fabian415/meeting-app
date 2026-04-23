import { defineStore } from 'pinia'
import { ref } from 'vue'

const OPENCLAW_STATE_STORAGE_KEY = 'meeting-recorder-openclaw-state'

function loadOpenClawState() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(OPENCLAW_STATE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveOpenClawState(state) {
  if (typeof window === 'undefined') return

  try {
    if (!state?.sessionId && !state?.context && !state?.draft && !state?.messages?.length) {
      window.sessionStorage.removeItem(OPENCLAW_STATE_STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(OPENCLAW_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export const useMeetingStore = defineStore('meeting', () => {
  const savedOpenClawState = loadOpenClawState()
  const currentView = ref('record')
  const audioBlob = ref(null)
  const audioDuration = ref(0)
  const audioUrl = ref(null)
  const audioFileName = ref('')
  const meetingTitle = ref('')
  const meetingStartTime = ref(null)
  const meetingEndTime = ref(null)
  const uploadResult = ref(null)
  const conversationMessages = ref(Array.isArray(savedOpenClawState?.messages) ? savedOpenClawState.messages : [])
  const openclawSessionId = ref(savedOpenClawState?.sessionId || null)
  const conversationContext = ref(savedOpenClawState?.context || null)
  const conversationDraft = ref(savedOpenClawState?.draft || '')

  function persistOpenClawState() {
    saveOpenClawState({
      sessionId: openclawSessionId.value,
      context: conversationContext.value,
      messages: conversationMessages.value,
      draft: conversationDraft.value,
    })
  }

  function setAudio(blob, duration, fileName = '') {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
    }

    if (!blob) {
      audioBlob.value = null
      audioDuration.value = 0
      audioUrl.value = null
      audioFileName.value = ''
      return
    }

    audioBlob.value = blob
    audioDuration.value = duration
    audioUrl.value = URL.createObjectURL(blob)
    audioFileName.value = fileName
  }

  function reset() {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
    }
    audioBlob.value = null
    audioDuration.value = 0
    audioUrl.value = null
    audioFileName.value = ''
    meetingTitle.value = ''
    meetingStartTime.value = null
    meetingEndTime.value = null
    uploadResult.value = null
    conversationMessages.value = []
    openclawSessionId.value = null
    conversationContext.value = null
    conversationDraft.value = ''
    persistOpenClawState()
    currentView.value = 'record'
  }

  function startConversation({ sessionId = null, context = null, initialMessages = [], draft = '' }) {
    openclawSessionId.value = sessionId
    conversationContext.value = context
    conversationMessages.value = initialMessages
    conversationDraft.value = draft
    persistOpenClawState()
    currentView.value = 'conversation'
  }

  function replaceConversationMessages(messages) {
    conversationMessages.value = messages
    persistOpenClawState()
  }

  function appendConversationMessage(message) {
    conversationMessages.value.push(message)
    persistOpenClawState()
  }

  function setOpenClawSession({ sessionId = null, context = null }) {
    openclawSessionId.value = sessionId
    conversationContext.value = context
    persistOpenClawState()
  }

  function setConversationDraft(draft = '') {
    conversationDraft.value = draft
    persistOpenClawState()
  }

  return {
    currentView,
    audioBlob,
    audioDuration,
    audioUrl,
    audioFileName,
    meetingTitle,
    meetingStartTime,
    meetingEndTime,
    uploadResult,
    conversationMessages,
    openclawSessionId,
    conversationContext,
    conversationDraft,
    setAudio,
    reset,
    startConversation,
    replaceConversationMessages,
    appendConversationMessage,
    setOpenClawSession,
    setConversationDraft,
  }
})
