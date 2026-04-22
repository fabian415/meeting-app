<script setup>
import { ref, onMounted } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import { uploadMeeting } from '../api/index.js'
import { canUseRecordingDraftStore, clearRecordingDraft, getRecordingDraft } from '../services/recordingDraftStore.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const status = ref('uploading')
const progress = ref(0)
const errorMessage = ref('')
const uploadedFiles = ref([])

onMounted(async () => {
  await doUpload()
})

async function doUpload() {
  status.value = 'uploading'
  progress.value = 0
  errorMessage.value = ''

  const progressInterval = setInterval(() => {
    if (progress.value < 80) progress.value += Math.random() * 8
  }, 300)

  try {
    const draftUpload = await getDraftUploadSegments()
    const result = await uploadMeeting({
      audioBlob: store.audioBlob,
      audioFileName: store.audioFileName,
      audioSegments: draftUpload.segments,
      segmentMimeType: draftUpload.mimeType,
      meetingTitle: store.meetingTitle,
      meetingStartTime: store.meetingStartTime,
      meetingEndTime: store.meetingEndTime,
      audioDuration: store.audioDuration,
    })

    clearInterval(progressInterval)
    progress.value = 100
    status.value = 'success'
    uploadedFiles.value = result.files || []
    store.uploadResult = result
    if (canUseRecordingDraftStore()) {
      await clearRecordingDraft().catch(() => {})
    }

    store.startConversation({
      sessionId: result.conversationContext?.sessionId || null,
      context: result.conversationContext || null,
      initialMessages: [],
      draft: result.suggestedPrompt || '',
    })

    emit('toast', { type: 'success', message: '檔案已成功上傳，請確認訊息後再送出給 OpenClaw。' })
  } catch (err) {
    clearInterval(progressInterval)
    progress.value = 0
    status.value = 'error'
    errorMessage.value = err.response?.data?.message || err.message || '上傳失敗，請稍後再試'

    emit('toast', { type: 'error', message: errorMessage.value })
  }
}

async function getDraftUploadSegments() {
  if (!canUseRecordingDraftStore()) {
    return { segments: [], mimeType: '' }
  }

  try {
    const draft = await getRecordingDraft()
    const sameRecording = draft.meta?.meetingStartTime && draft.meta.meetingStartTime === store.meetingStartTime

    if (!sameRecording || draft.segments.length <= 1) {
      return { segments: [], mimeType: '' }
    }

    return {
      segments: draft.segments.map(segment => new Blob(segment.blobs, { type: draft.meta.mimeType || 'audio/webm' })),
      mimeType: draft.meta.mimeType || 'audio/webm',
    }
  } catch (error) {
    emit('toast', { type: 'error', message: `無法讀取續錄片段，將改以上方試播音檔上傳：${error.message}` })
    return { segments: [], mimeType: '' }
  }
}

function startOver() {
  store.reset()
}

function goBack() {
  store.currentView = 'record'
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>

<template>
  <div class="flex h-full flex-col lg:px-8 lg:py-8">
    <div class="flex items-center gap-3 px-6 pb-6 pt-8 lg:px-0 lg:pb-8 lg:pt-4">
      <button
        v-if="status !== 'uploading'"
        class="glass-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-transform active:scale-95"
        @click="goBack"
      >
        ←
      </button>
      <div>
        <h1 class="text-xl font-bold text-white">
          {{ status === 'uploading' ? '上傳中' : status === 'success' ? '上傳完成' : '上傳失敗' }}
        </h1>
        <p v-if="store.meetingTitle" class="mt-0.5 text-xs text-slate-400">{{ store.meetingTitle }}</p>
      </div>
    </div>

    <div class="flex-1 px-6 pb-8 lg:min-h-0 lg:px-0 lg:pb-0">
      <template v-if="status === 'uploading'">
        <div class="fade-in flex h-full flex-col items-center justify-center gap-6 lg:grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:gap-8">
          <div class="relative h-28 w-28 lg:h-36 lg:w-36">
            <div class="h-28 w-28 rounded-full border-4 border-white/10 lg:h-36 lg:w-36"></div>
            <div class="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin-slow"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-4xl">↑</span>
            </div>
          </div>

          <div class="w-full max-w-3xl space-y-4">
            <div class="glass-card p-4 lg:p-5">
              <div class="mb-2 flex justify-between text-sm">
                <span class="text-slate-300">正在上傳並建立 OpenClaw 對話內容...</span>
                <span class="font-mono text-blue-400">{{ Math.round(progress) }}%</span>
              </div>
              <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div class="h-full rounded-full transition-all duration-300" style="background: linear-gradient(90deg, #3b82f6, #6366f1)" :style="{ width: progress + '%' }"></div>
              </div>
            </div>

            <div class="glass-card p-4 lg:p-5">
              <p class="text-sm font-medium text-white">目前檔案</p>
              <p class="mt-2 text-sm text-slate-300">{{ store.audioFileName || formatBytes(store.audioBlob?.size) }}</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="status === 'success'">
        <div class="fade-in flex h-full flex-col items-center justify-center gap-6 lg:mx-auto lg:max-w-4xl">
          <div class="flex h-28 w-28 items-center justify-center rounded-full border-2 border-emerald-500/50 bg-emerald-500/20">
            <span class="text-5xl">✓</span>
          </div>

          <div class="text-center">
            <h2 class="text-xl font-bold text-white">上傳完成</h2>
            <p class="mt-1 text-sm text-slate-400">系統已建立好 OpenClaw 對話草稿。</p>
          </div>

          <div class="glass-card flex w-full flex-col gap-3 p-4 lg:p-5">
            <p class="mb-1 text-sm font-medium text-slate-300">已處理檔案</p>
            <div v-for="file in uploadedFiles" :key="file.name" class="flex items-center gap-3 border-t border-white/5 py-2">
              <span class="text-lg text-emerald-400">✓</span>
              <div class="min-w-0">
                <p class="truncate text-sm font-mono text-white">{{ file.name }}</p>
                <p class="text-xs text-slate-500">{{ formatBytes(file.size) }}</p>
              </div>
            </div>
          </div>

          <button class="btn-primary lg:min-w-60" @click="startOver">重新開始</button>
        </div>
      </template>

      <template v-else>
        <div class="fade-in flex h-full flex-col items-center justify-center gap-6 lg:mx-auto lg:max-w-4xl">
          <div class="flex h-28 w-28 items-center justify-center rounded-full border-2 border-red-500/50 bg-red-500/20">
            <span class="text-5xl">!</span>
          </div>

          <div class="text-center">
            <h2 class="text-xl font-bold text-white">上傳失敗</h2>
            <p class="mt-1 text-sm text-slate-400">請確認檔案與服務狀態後再重試。</p>
          </div>

          <div class="glass-card w-full border-red-500/30 p-4">
            <p class="mb-1 text-sm font-medium text-red-300">錯誤訊息</p>
            <p class="text-sm leading-relaxed text-red-200">{{ errorMessage }}</p>
          </div>

          <div class="flex w-full flex-col gap-3 lg:flex-row">
            <button class="btn-primary" @click="doUpload">重新上傳</button>
            <button class="btn-primary btn-secondary" @click="startOver">重新開始</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
