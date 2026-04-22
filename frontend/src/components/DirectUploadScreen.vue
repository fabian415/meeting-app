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
  <div class="flex h-full flex-col lg:px-8 lg:py-8">
    <div class="px-6 pb-4 pt-8 text-center lg:px-0 lg:pb-8 lg:pt-4">
      <h1 class="text-2xl font-bold tracking-tight text-white">直接上傳音檔</h1>
      <p class="mt-1 text-sm text-slate-400">匯入既有錄音檔，手機與桌機都能順暢完成上傳流程。</p>
    </div>

    <div class="flex-1 px-6 pb-8 lg:min-h-0 lg:px-0 lg:pb-0">
      <div class="glass-card flex h-full flex-col gap-5 p-5 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:gap-8 lg:p-8">
        <div class="flex flex-col gap-5">
          <label class="flex flex-col gap-2">
            <span class="text-sm font-medium text-slate-200">會議標題</span>
            <input
              v-model="store.meetingTitle"
              type="text"
              placeholder="例如：產品週會"
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

          <div class="flex flex-1 flex-col justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center lg:min-h-[22rem] lg:px-8">
            <p class="text-sm text-slate-300">支援 `mp3`、`wav`、`m4a`、`webm` 等常見音訊格式。</p>
            <button class="btn-primary mt-4" type="button" @click="openFilePicker">
              <span class="text-xl">+</span>
              選擇音檔
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-5 lg:justify-between">
          <div class="rounded-2xl border border-white/10 bg-slate-950/25 p-5 lg:min-h-[22rem]">
            <p class="text-sm font-medium text-slate-200">上傳摘要</p>

            <div v-if="selectedFile" class="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-white">{{ selectedFile.name }}</p>
                  <p class="mt-1 text-xs text-slate-300">{{ formatBytes(selectedFile.size) }}</p>
                  <p class="mt-1 text-xs text-slate-400">
                    {{ loadingDuration ? '讀取音檔長度中...' : formatDuration(store.audioDuration) }}
                  </p>
                </div>
                <button class="text-sm text-red-300 transition-colors hover:text-red-200" type="button" @click="clearSelectedFile">
                  清除
                </button>
              </div>
            </div>

            <div v-else class="mt-4 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-white/8 px-4 text-center text-sm text-slate-500">
              尚未選擇音檔。桌機版會固定顯示這個摘要區，手機版則會依序往下顯示。
            </div>
          </div>

          <div class="mt-auto flex flex-col gap-3">
            <button class="btn-primary" type="button" :disabled="!store.audioBlob" @click="submitUpload">
              送出到 OpenClaw
            </button>
            <p class="text-center text-xs leading-relaxed text-slate-500 lg:text-left">
              先確認標題與檔案資訊，再進入上傳與後續對話流程。
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
