import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMeetingStore = defineStore('meeting', () => {
  const currentView = ref('record')
  const audioBlob = ref(null)
  const audioDuration = ref(0)
  const audioUrl = ref(null)
  const audioFileName = ref('')
  const meetingTitle = ref('')
  const meetingStartTime = ref(null)
  const meetingEndTime = ref(null)
  const uploadResult = ref(null)
  const conversationMessages = ref([])
  const openclawSessionId = ref(null)
  const conversationContext = ref(null)
  const conversationDraft = ref('')

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
    currentView.value = 'record'
  }

  function startConversation({ sessionId = null, context = null, initialMessages = [], draft = '' }) {
    openclawSessionId.value = sessionId
    conversationContext.value = context
    conversationMessages.value = initialMessages
    conversationDraft.value = draft
    currentView.value = 'conversation'
  }

  function replaceConversationMessages(messages) {
    conversationMessages.value = messages
  }

  function appendConversationMessage(message) {
    conversationMessages.value.push(message)
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
  }
})
