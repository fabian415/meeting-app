import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMeetingStore = defineStore('meeting', () => {
  const currentView = ref('record') // 'record' | 'upload'

  const audioBlob = ref(null)
  const audioDuration = ref(0)
  const audioUrl = ref(null)

  const meetingTitle = ref('')
  const meetingStartTime = ref(null) // ISO string
  const meetingEndTime = ref(null)   // ISO string

  const uploadResult = ref(null) // { success, message, files }

  function setAudio(blob, duration) {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
    }
    audioBlob.value = blob
    audioDuration.value = duration
    audioUrl.value = URL.createObjectURL(blob)
  }

  function reset() {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
    }
    audioBlob.value = null
    audioDuration.value = 0
    audioUrl.value = null
    meetingTitle.value = ''
    meetingStartTime.value = null
    meetingEndTime.value = null
    uploadResult.value = null
    currentView.value = 'record'
  }

  return {
    currentView,
    audioBlob,
    audioDuration,
    audioUrl,
    meetingTitle,
    meetingStartTime,
    meetingEndTime,
    uploadResult,
    setAudio,
    reset,
  }
})
