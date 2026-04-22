<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { deleteSpeaker, enrollSpeaker, listSpeakers } from '../api/index.js'

const emit = defineEmits(['toast'])

const speakers = ref([])
const loading = ref(false)
const enrolling = ref(false)
const deletingName = ref(null)
const enrollCollapsed = ref(true)

const playingName = ref(null)
const loadingAudio = ref(null)
const audioEl = ref(null)
const audioBlobUrl = ref(null)

const enrollName = ref('')
const audioFile = ref(null)
const audioDuration = ref(null)
const audioError = ref('')
const fileInputRef = ref(null)
const audioPreviewUrl = ref(null)
const audioSource = ref('upload')

const isRecording = ref(false)
const isPaused = ref(false)
const recordSeconds = ref(0)
const audioLevel = ref(0)
const waveformBars = ref(Array(9).fill(8))

const MIN_SEC = 1
const MAX_SEC = 120

let recorder = null
let recorderStream = null
let recordingTimer = null
let audioContext = null
let analyserNode = null
let animationFrame = null
let audioChunks = []

const formattedRecordTime = computed(() => formatDuration(recordSeconds.value))

async function fetchSpeakers() {
  loading.value = true
  try {
    const data = await listSpeakers()
    speakers.value = data.speakers || []
  } catch (error) {
    emit('toast', { type: 'error', message: `載入 Speaker 失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    loading.value = false
  }
}

function resetRecorderVisuals() {
  waveformBars.value = Array(9).fill(8)
  audioLevel.value = 0
}

function resetSelectedAudio({ keepSource = false } = {}) {
  audioFile.value = null
  audioDuration.value = null
  audioError.value = ''
  if (audioPreviewUrl.value) {
    URL.revokeObjectURL(audioPreviewUrl.value)
    audioPreviewUrl.value = null
  }
  if (!keepSource) {
    audioSource.value = 'upload'
  }
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function validateDuration(duration) {
  if (duration < MIN_SEC) {
    return `音檔太短（${duration.toFixed(1)} 秒），請提供至少 ${MIN_SEC} 秒的錄音。`
  }
  if (duration > MAX_SEC) {
    return `音檔太長（${duration.toFixed(1)} 秒），請提供不超過 ${MAX_SEC} 秒的錄音。`
  }
  return ''
}

function createPreviewUrl(file) {
  if (audioPreviewUrl.value) {
    URL.revokeObjectURL(audioPreviewUrl.value)
  }
  audioPreviewUrl.value = URL.createObjectURL(file)
}

function loadAudioMetadata(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const audio = new Audio(objectUrl)
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      audio.removeAttribute('src')
      audio.load()
    }

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      cleanup()
      resolve(duration)
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('無法讀取音檔，請換一個檔案。'))
    }
    audio.src = objectUrl
  })
}

async function setSelectedAudio(file, source) {
  audioSource.value = source
  audioFile.value = file
  audioDuration.value = null
  audioError.value = ''
  createPreviewUrl(file)

  try {
    const duration = await loadAudioMetadata(file)
    audioDuration.value = duration
    audioError.value = validateDuration(duration)
  } catch (error) {
    audioError.value = error.message
  }
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await stopRecording({ discard: true, silent: true })
  await setSelectedAudio(file, 'upload')
}

function getSupportedMimeType() {
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ].find(type => MediaRecorder.isTypeSupported(type)) || ''
}

function renderWaveform() {
  if (!analyserNode) return
  const data = new Uint8Array(analyserNode.frequencyBinCount)
  analyserNode.getByteFrequencyData(data)
  const chunkSize = Math.max(1, Math.floor(data.length / waveformBars.value.length))
  waveformBars.value = Array.from({ length: waveformBars.value.length }, (_, index) => {
    const raw = data[index * chunkSize] / 255
    return Math.max(8, Math.round(raw * 48))
  })
  const avg = data.reduce((sum, value) => sum + value, 0) / data.length
  audioLevel.value = Math.round((avg / 255) * 100)

  if (isRecording.value && !isPaused.value) {
    animationFrame = requestAnimationFrame(renderWaveform)
  }
}

function cleanupRecordingResources() {
  if (recordingTimer) {
    clearInterval(recordingTimer)
    recordingTimer = null
  }
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  if (recorderStream) {
    recorderStream.getTracks().forEach(track => track.stop())
    recorderStream = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyserNode = null
  recorder = null
  audioChunks = []
  isRecording.value = false
  isPaused.value = false
  resetRecorderVisuals()
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    emit('toast', { type: 'error', message: '目前瀏覽器不支援線上錄音。' })
    return
  }

  try {
    await stopRecording({ discard: true, silent: true })
    resetSelectedAudio({ keepSource: true })
    recordSeconds.value = 0
    audioSource.value = 'record'

    recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioContext.createMediaStreamSource(recorderStream)
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 256
    source.connect(analyserNode)

    const mimeType = getSupportedMimeType()
    recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined)
    audioChunks = []
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data)
      }
    }
    recorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' })
      const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `speaker-sample.${extension}`, { type: blob.type || 'audio/webm' })
      await setSelectedAudio(file, 'record')
      cleanupRecordingResources()
    }

    recorder.start(100)
    isRecording.value = true
    isPaused.value = false
    recordingTimer = window.setInterval(() => {
      if (!isPaused.value) {
        recordSeconds.value += 1
      }
    }, 1000)
    renderWaveform()
    emit('toast', { type: 'info', message: '開始錄音...' })
  } catch (error) {
    cleanupRecordingResources()
    if (error.name === 'NotAllowedError') {
      emit('toast', { type: 'error', message: '請先允許瀏覽器使用麥克風。' })
      return
    }
    emit('toast', { type: 'error', message: `無法開始錄音：${error.message}` })
  }
}

function toggleRecordingPause() {
  if (!recorder || recorder.state === 'inactive') return

  if (isPaused.value) {
    recorder.resume()
    isPaused.value = false
    renderWaveform()
    emit('toast', { type: 'info', message: '已繼續錄音' })
    return
  }

  recorder.pause()
  isPaused.value = true
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  resetRecorderVisuals()
  emit('toast', { type: 'info', message: '錄音已暫停' })
}

async function stopRecording({ discard = false, silent = false } = {}) {
  if (!recorder || recorder.state === 'inactive') {
    if (discard) {
      cleanupRecordingResources()
      recordSeconds.value = 0
    }
    return
  }

  const currentRecorder = recorder
  const stopPromise = new Promise(resolve => {
    currentRecorder.addEventListener('stop', resolve, { once: true })
  })

  currentRecorder.stop()
  if (discard) {
    audioChunks = []
  }
  await stopPromise

  if (discard) {
    resetSelectedAudio({ keepSource: true })
    recordSeconds.value = 0
  }

  if (!silent && !discard) {
    emit('toast', { type: 'success', message: `錄音完成，共 ${formatDuration(recordSeconds.value)}` })
  }
}

async function rerecord() {
  await stopRecording({ discard: true, silent: true })
  await startRecording()
}

async function handleEnroll() {
  if (!enrollName.value.trim()) {
    emit('toast', { type: 'error', message: '請輸入 Speaker 姓名' })
    return
  }
  if (!audioFile.value) {
    emit('toast', { type: 'error', message: '請先上傳或錄製音檔' })
    return
  }
  if (audioError.value) {
    emit('toast', { type: 'error', message: audioError.value })
    return
  }

  enrolling.value = true
  try {
    await enrollSpeaker({ name: enrollName.value.trim(), audioBlob: audioFile.value })
    emit('toast', { type: 'success', message: `Speaker ${enrollName.value.trim()} 註冊成功！` })
    enrollName.value = ''
    resetSelectedAudio()
    recordSeconds.value = 0
    enrollCollapsed.value = true
    await fetchSpeakers()
  } catch (error) {
    emit('toast', { type: 'error', message: `註冊失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    enrolling.value = false
  }
}

async function handleDelete(name) {
  stopAudio()
  deletingName.value = name
  try {
    await deleteSpeaker(name)
    emit('toast', { type: 'success', message: `Speaker ${name} 已刪除` })
    await fetchSpeakers()
  } catch (error) {
    emit('toast', { type: 'error', message: `刪除失敗：${error.response?.data?.detail || error.message}` })
  } finally {
    deletingName.value = null
  }
}

function stopAudio() {
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.src = ''
    audioEl.value = null
  }
  if (audioBlobUrl.value) {
    URL.revokeObjectURL(audioBlobUrl.value)
    audioBlobUrl.value = null
  }
  playingName.value = null
  loadingAudio.value = null
}

async function togglePlay(sp) {
  if (playingName.value === sp.name) {
    stopAudio()
    return
  }
  if (loadingAudio.value === sp.name) return

  stopAudio()
  loadingAudio.value = sp.name

  try {
    const res = await fetch(`/whisper/speakers/${encodeURIComponent(sp.name)}/audio`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    audioBlobUrl.value = url

    const audio = new Audio(url)
    audioEl.value = audio
    playingName.value = sp.name
    loadingAudio.value = null

    audio.addEventListener('ended', () => {
      if (playingName.value === sp.name) {
        stopAudio()
      }
    })

    await audio.play()
  } catch (error) {
    emit('toast', { type: 'error', message: `播放 ${sp.name} 的音檔失敗：${error.message}` })
    stopAudio()
  }
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const total = Math.round(seconds)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

onMounted(fetchSpeakers)
onUnmounted(async () => {
  stopAudio()
  await stopRecording({ discard: true, silent: true })
  resetSelectedAudio({ keepSource: true })
})
</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto px-4 pb-6 pt-14 sm:px-6 lg:px-8 lg:pb-8 lg:pt-20">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">聲紋管理</h1>
      <p class="mt-1 text-sm text-white/50">管理已註冊的 Speaker 聲紋與測試音檔播放</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.05fr)] lg:items-start">
      <div class="glass-card rounded-2xl p-4 lg:sticky lg:top-4 lg:p-5">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
          @click="enrollCollapsed = !enrollCollapsed"
        >
          <h2 class="flex items-center gap-2 text-base font-semibold text-white">
            <span class="text-lg">＋</span>
            <span>新增 Speaker</span>
          </h2>
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-transform duration-200"
            :class="enrollCollapsed ? '' : 'rotate-180'"
          >
            ▼
          </span>
        </button>

        <Transition name="collapse">
          <div v-if="!enrollCollapsed" class="mt-4 space-y-4">
            <div>
              <label class="mb-1 block text-xs text-white/60">Speaker 姓名</label>
              <input
                v-model="enrollName"
                type="text"
                placeholder="例如：Alice"
                :disabled="enrolling"
                class="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 transition-colors focus:border-blue-400/60 focus:outline-none"
              />
            </div>

            <div>
              <label class="mb-2 block text-xs text-white/60">音檔來源</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-xl border px-3 py-2 text-sm transition-colors"
                  :class="audioSource === 'upload' ? 'border-blue-400/60 bg-blue-500/15 text-blue-200' : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30'"
                  :disabled="enrolling || isRecording"
                  @click="audioSource = 'upload'"
                >
                  上傳音檔
                </button>
                <button
                  type="button"
                  class="rounded-xl border px-3 py-2 text-sm transition-colors"
                  :class="audioSource === 'record' ? 'border-blue-400/60 bg-blue-500/15 text-blue-200' : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30'"
                  :disabled="enrolling"
                  @click="audioSource = 'record'"
                >
                  線上錄音
                </button>
              </div>
              <p class="mt-2 text-xs text-white/40">樣本長度建議介於 {{ MIN_SEC }} 到 {{ MAX_SEC }} 秒之間。</p>
            </div>

            <div v-if="audioSource === 'upload'" class="space-y-3">
              <label
                class="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2 transition-colors hover:border-blue-400/60"
                :class="{ 'pointer-events-none opacity-50': enrolling || isRecording }"
              >
                <span class="text-sm text-blue-400">↑</span>
                <span class="truncate text-sm" :class="audioFile && audioSource === 'upload' ? 'text-white' : 'text-white/30'">
                  {{ audioFile && audioSource === 'upload' ? audioFile.name : '選擇音訊檔案…' }}
                </span>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="audio/*"
                  class="hidden"
                  @change="handleFileChange"
                />
              </label>
            </div>

            <div v-else class="space-y-3">
              <div class="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4">
                <div class="flex min-h-28 items-center justify-center rounded-xl border border-white/8 bg-black/10 px-3 py-4">
                  <div v-if="isRecording && !isPaused" class="flex items-end gap-1.5">
                    <div
                      v-for="(bar, index) in waveformBars"
                      :key="index"
                      class="waveform-bar transition-all duration-75"
                      :style="{ height: `${bar}px` }"
                    ></div>
                  </div>
                  <div v-else-if="isPaused" class="text-sm font-medium text-amber-400">錄音已暫停</div>
                  <div v-else-if="audioFile && audioSource === 'record'" class="w-full max-w-sm">
                    <p class="mb-3 text-center text-sm font-medium text-emerald-400">錄音完成，可先播放確認</p>
                    <audio :src="audioPreviewUrl" controls class="w-full rounded-xl" style="height: 40px" />
                  </div>
                  <div v-else class="text-center text-xs text-slate-400">按下開始錄音後，就能直接建立 Speaker 樣本。</div>
                </div>

                <div class="mt-4 text-center">
                  <div class="text-3xl font-mono font-bold tracking-widest text-white">{{ formattedRecordTime }}</div>
                  <p class="mt-1 text-xs" :class="isRecording ? (isPaused ? 'text-amber-400' : 'text-red-400') : 'text-white/40'">
                    {{ isRecording ? (isPaused ? '暫停中' : '錄音中') : (audioFile && audioSource === 'record' ? '已完成錄音' : '尚未開始錄音') }}
                  </p>
                  <p class="mt-1 text-xs text-slate-400">音量強度 {{ audioLevel }}%</p>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <button
                    v-if="!isRecording"
                    type="button"
                    class="btn-primary flex-1"
                    :disabled="enrolling"
                    @click="startRecording"
                  >
                    開始錄音
                  </button>
                  <template v-else>
                    <button type="button" class="btn-primary btn-secondary flex-1" :disabled="enrolling" @click="toggleRecordingPause">
                      {{ isPaused ? '繼續錄音' : '暫停錄音' }}
                    </button>
                    <button type="button" class="btn-primary btn-danger flex-1" :disabled="enrolling" @click="stopRecording()">
                      停止錄音
                    </button>
                  </template>
                  <button
                    v-if="!isRecording && audioFile && audioSource === 'record'"
                    type="button"
                    class="btn-primary btn-secondary flex-1"
                    :disabled="enrolling"
                    @click="rerecord"
                  >
                    重新錄音
                  </button>
                </div>
              </div>
            </div>

            <div v-if="audioFile" class="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-white">{{ audioFile.name }}</p>
                  <p class="mt-1 text-xs text-slate-300">
                    來源：{{ audioSource === 'record' ? '線上錄音' : '上傳檔案' }}
                  </p>
                  <p v-if="audioDuration !== null && !audioError" class="mt-1 text-xs text-green-400">
                    時長：{{ audioDuration.toFixed(1) }} 秒
                  </p>
                  <p v-if="audioError" class="mt-1 text-xs text-red-400">
                    {{ audioError }}
                  </p>
                </div>
                <button
                  type="button"
                  class="text-sm text-red-300 transition-colors hover:text-red-200"
                  :disabled="enrolling"
                  @click="resetSelectedAudio({ keepSource: true })"
                >
                  清除
                </button>
              </div>
              <audio
                v-if="audioPreviewUrl && (!isRecording || audioSource === 'upload')"
                :src="audioPreviewUrl"
                controls
                class="mt-3 w-full rounded-xl"
                style="height: 40px"
              />
            </div>

            <button
              type="button"
              class="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="enrolling || !!audioError || isRecording"
              @click="handleEnroll"
            >
              <svg v-if="enrolling" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>{{ enrolling ? '註冊中...' : '註冊 Speaker' }}</span>
            </button>
          </div>
        </Transition>
      </div>

      <div class="glass-card rounded-2xl p-4 lg:min-h-[34rem] lg:p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-base font-semibold text-white">
            <span class="text-lg">👥</span>
            <span>已註冊 Speaker</span>
          </h2>
          <button
            type="button"
            @click="fetchSpeakers"
            :disabled="loading"
            class="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
          >
            <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重新整理
          </button>
        </div>

        <div v-if="loading" class="flex justify-center py-6">
          <svg class="h-6 w-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <div v-else-if="speakers.length === 0" class="py-6 text-center text-sm text-white/30">
          尚無已註冊的 Speaker
        </div>

        <ul v-else class="max-h-[28rem] space-y-2 overflow-y-auto lg:max-h-[40rem]">
          <li
            v-for="sp in speakers"
            :key="sp.name"
            class="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-3"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
              {{ sp.name.charAt(0).toUpperCase() }}
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-white">{{ sp.name }}</p>
              <p class="truncate text-xs text-white/40">{{ sp.source_file }} · {{ sp.dim }}D</p>
            </div>

            <button
              v-if="sp.has_audio"
              type="button"
              @click="togglePlay(sp)"
              :disabled="loadingAudio === sp.name"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-60"
              :class="playingName === sp.name ? 'bg-blue-400/20 text-blue-300 hover:bg-blue-400/30' : 'text-white/50 hover:bg-white/10 hover:text-blue-300'"
              :title="playingName === sp.name ? '停止播放' : '播放音檔'"
            >
              <svg v-if="loadingAudio === sp.name" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <svg v-else-if="playingName === sp.name" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <svg v-else class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </button>

            <button
              type="button"
              @click="handleDelete(sp.name)"
              :disabled="deletingName === sp.name"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400/70 transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-40"
              title="刪除 Speaker"
            >
              <svg v-if="deletingName === sp.name" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collapse-enter-active,
.collapse-leave-active {
  overflow: hidden;
  transition: all 0.22s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 1000px;
  opacity: 1;
  transform: translateY(0);
}

.waveform-bar {
  width: 0.45rem;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(96, 165, 250, 1), rgba(59, 130, 246, 0.28));
}
</style>
