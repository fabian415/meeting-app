<script setup>
import { ref } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const loadingDuration = ref(false)

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (!isAudioFile(file)) {
    selectedFile.value = null
    store.setAudio(null, 0)
    emit('toast', { type: 'error', message: '請選擇音訊格式的錄音檔' })
    return
  }

  selectedFile.value = file
  loadingDuration.value = true

  try {
    const duration = await getAudioDuration(file)
    store.setAudio(file, duration, file.name)
    store.meetingStartTime = null
    store.meetingEndTime = null
  } catch (error) {
    store.setAudio(file, 0, file.name)
    store.meetingStartTime = null
    store.meetingEndTime = null
    emit('toast', { type: 'info', message: '已選擇檔案，但無法讀取音檔長度，將直接上傳。' })
  } finally {
    loadingDuration.value = false
  }
}

function submitUpload() {
  if (!store.audioBlob) {
    emit('toast', { type: 'error', message: '請先選擇錄音檔案' })
    return
  }

  store.currentView = 'upload'
}

function clearSelectedFile() {
  selectedFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  store.setAudio(null, 0)
}

function isAudioFile(file) {
  if (file.type?.startsWith('audio/')) return true
  return /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i.test(file.name || '')
}

function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const audio = document.createElement('audio')

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      audio.removeAttribute('src')
      audio.load()
    }

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0
      cleanup()
      resolve(duration)
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('Failed to load audio metadata'))
    }
    audio.src = objectUrl
  })
}

function formatDuration(seconds) {
  if (!seconds) return '未能辨識長度'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="px-6 pt-8 pb-4 text-center">
      <h1 class="text-2xl font-bold text-white tracking-tight">上傳既有錄音檔</h1>
      <p class="mt-1 text-sm text-slate-400">輸入會議名稱並選擇音檔，接著沿用原本的 OpenClaw 流程。</p>
    </div>

    <div class="flex-1 px-6 pb-8">
      <div class="glass-card flex h-full flex-col gap-5 p-5">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-slate-200">會議名稱</span>
          <input
            v-model="store.meetingTitle"
            type="text"
            placeholder="例如：產品需求訪談"
            class="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
            style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);"
          />
        </label>

        <input
          ref="fileInput"
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
          class="hidden"
          @change="handleFileChange"
        />

        <div
          class="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center"
        >
          <p class="text-sm text-slate-300">支援常見錄音格式，像是 `mp3`、`wav`、`m4a`、`webm`。</p>
          <button class="btn-primary mt-4" type="button" @click="openFilePicker">
            <span class="text-xl">↑</span>
            選擇錄音檔
          </button>
        </div>

        <div v-if="selectedFile" class="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-white">{{ selectedFile.name }}</p>
              <p class="mt-1 text-xs text-slate-300">{{ formatBytes(selectedFile.size) }}</p>
              <p class="mt-1 text-xs text-slate-400">
                {{ loadingDuration ? '讀取音檔資訊中...' : formatDuration(store.audioDuration) }}
              </p>
            </div>
            <button class="text-sm text-red-300 transition-colors hover:text-red-200" type="button" @click="clearSelectedFile">
              移除
            </button>
          </div>
        </div>

        <div class="mt-auto flex flex-col gap-3">
          <button class="btn-primary" type="button" :disabled="!store.audioBlob" @click="submitUpload">
            送出並進入 OpenClaw 流程
          </button>
          <p class="text-center text-xs leading-relaxed text-slate-500">
            送出後會先經過原本的上傳頁，再把建議訊息帶進 OpenClaw 對話。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
