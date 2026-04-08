<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const isRecording = ref(false)
const isPaused = ref(false)
const hasRecording = ref(false)
const elapsedSeconds = ref(0)
const audioLevel = ref(0)
const waveHeights = ref(Array(9).fill(8))

let mediaRecorder = null
let audioChunks = []
let timerInterval = null
let analyserNode = null
let animationFrame = null
let audioContext = null

const formattedTime = computed(() => {
  const h = Math.floor(elapsedSeconds.value / 3600)
  const m = Math.floor((elapsedSeconds.value % 3600) / 60)
  const s = elapsedSeconds.value % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function updateWaveform() {
  if (!analyserNode) return
  const data = new Uint8Array(analyserNode.frequencyBinCount)
  analyserNode.getByteFrequencyData(data)

  const step = Math.max(1, Math.floor(data.length / 9))
  waveHeights.value = Array.from({ length: 9 }, (_, i) => {
    const val = data[i * step] / 255
    return Math.max(8, Math.round(val * 48))
  })

  const avg = data.reduce((a, b) => a + b, 0) / data.length
  audioLevel.value = Math.round((avg / 255) * 100)

  if (isRecording.value && !isPaused.value) {
    animationFrame = requestAnimationFrame(updateWaveform)
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioContext.createMediaStreamSource(stream)
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 256
    source.connect(analyserNode)

    const mimeType = getSupportedMimeType()
    const options = mimeType ? { mimeType } : {}
    mediaRecorder = new MediaRecorder(stream, options)

    audioChunks = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' })
      store.setAudio(blob, elapsedSeconds.value)
      hasRecording.value = true

      stream.getTracks().forEach(track => track.stop())
      if (audioContext) {
        audioContext.close()
        audioContext = null
      }
      waveHeights.value = Array(9).fill(8)
      audioLevel.value = 0
    }

    audioChunks = []
    elapsedSeconds.value = 0
    hasRecording.value = false
    mediaRecorder.start(100)
    isRecording.value = true
    isPaused.value = false
    store.meetingStartTime = new Date().toISOString()
    store.meetingEndTime = null

    timerInterval = window.setInterval(() => {
      if (!isPaused.value) elapsedSeconds.value += 1
    }, 1000)

    updateWaveform()
    emit('toast', { type: 'info', message: '開始錄音...' })
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      emit('toast', { type: 'error', message: '請先允許瀏覽器使用麥克風。' })
      return
    }
    emit('toast', { type: 'error', message: `無法開始錄音：${error.message}` })
  }
}

function pauseRecording() {
  if (!mediaRecorder) return

  if (isPaused.value) {
    mediaRecorder.resume()
    isPaused.value = false
    updateWaveform()
    emit('toast', { type: 'info', message: '已繼續錄音' })
    return
  }

  mediaRecorder.pause()
  isPaused.value = true
  cancelAnimationFrame(animationFrame)
  waveHeights.value = Array(9).fill(8)
  emit('toast', { type: 'info', message: '錄音已暫停' })
}

function stopRecording() {
  if (!mediaRecorder) return
  clearInterval(timerInterval)
  cancelAnimationFrame(animationFrame)
  store.meetingEndTime = new Date().toISOString()
  mediaRecorder.stop()
  isRecording.value = false
  isPaused.value = false
  emit('toast', { type: 'success', message: `錄音完成，共 ${formattedTime.value}` })
}

function discardRecording() {
  hasRecording.value = false
  elapsedSeconds.value = 0
  store.setAudio(null, 0)
  store.meetingStartTime = null
  store.meetingEndTime = null
  audioChunks = []
}

function goToUpload() {
  if (!store.audioBlob) return
  store.currentView = 'upload'
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return types.find(type => MediaRecorder.isTypeSupported(type)) || ''
}

onUnmounted(() => {
  clearInterval(timerInterval)
  cancelAnimationFrame(animationFrame)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  if (audioContext) audioContext.close()
})
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden lg:px-8 lg:py-6">
    <div class="shrink-0 px-6 pb-4 pt-8 text-center lg:px-0 lg:pb-5 lg:pt-2">
      <h1 class="text-2xl font-bold tracking-tight text-white">會議錄音</h1>
      <p class="mt-1 text-sm text-slate-400">先錄音，再送進上傳與 OpenClaw 對話流程。</p>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-8 lg:px-0">
      <div class="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start lg:gap-6">
      <div class="glass-card flex flex-col gap-6 p-5 lg:p-8">
        <input
          v-model="store.meetingTitle"
          :disabled="isRecording"
          type="text"
          placeholder="輸入會議標題"
          class="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
          style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);"
          :style="isRecording ? 'opacity:0.4;cursor:not-allowed' : ''"
        />

        <div class="flex min-h-[15rem] items-center justify-center rounded-[1.5rem] border border-white/8 bg-slate-950/35 px-4 py-6 lg:min-h-[22rem]">
          <template v-if="isRecording && !isPaused">
            <div class="flex items-center justify-center gap-1.5">
              <div
                v-for="(height, index) in waveHeights"
                :key="index"
                class="waveform-bar transition-all duration-75"
                :style="{ height: `${height}px` }"
              />
            </div>
          </template>
          <template v-else-if="isPaused">
            <div class="flex items-center gap-2 text-amber-400">
              <span class="text-2xl">||</span>
              <span class="text-sm font-medium">錄音已暫停</span>
            </div>
          </template>
          <template v-else-if="hasRecording">
            <div class="w-full max-w-xl">
              <p class="mb-3 text-center text-sm font-medium text-emerald-400">錄音完成，可先播放確認</p>
              <audio
                :src="store.audioUrl"
                controls
                class="w-full rounded-xl"
                style="height: 40px;"
              />
            </div>
          </template>
          <template v-else>
            <div class="flex flex-col items-center gap-1 opacity-30">
              <div class="flex h-12 items-end gap-1.5">
                <div v-for="height in [16, 28, 40, 32, 48, 24, 36, 20, 32]" :key="height" class="waveform-bar" :style="{ height: `${height}px` }" />
              </div>
              <p class="mt-2 text-xs text-slate-400">等待開始錄音...</p>
            </div>
          </template>
        </div>

        <div class="text-center">
          <div class="text-5xl font-mono font-bold tracking-widest text-white lg:text-6xl" :class="isRecording && !isPaused ? 'text-red-400' : 'text-white'">
            {{ formattedTime }}
          </div>
          <p v-if="isRecording" class="mt-1.5 text-xs" :class="isPaused ? 'text-amber-400' : 'animate-pulse text-red-400'">
            {{ isPaused ? '暫停中' : '錄音中' }}
          </p>
        </div>
      </div>

      <div class="glass-card flex flex-col gap-6 p-5 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:p-6">
        <div class="rounded-[1.5rem] border border-white/8 bg-slate-950/30 p-4">
          <p class="text-sm text-slate-400">目前狀態</p>
          <p class="mt-2 text-lg font-semibold text-white">
            {{ isRecording ? (isPaused ? '錄音暫停中' : '正在錄音') : (hasRecording ? '已完成錄音' : '尚未開始錄音') }}
          </p>
          <p class="mt-1 text-sm text-slate-400">音量強度 {{ audioLevel }}%</p>
        </div>

        <p class="text-xs leading-relaxed text-slate-500 lg:text-sm">
          手機版會把所有區塊往下排列，桌機版則將波形區與操作區分開，按鈕會固定留在可點擊範圍內。
        </p>

        <div class="pointer-events-auto mt-auto flex flex-col gap-3">
          <template v-if="!isRecording && !hasRecording">
            <button class="btn-primary relative z-10" type="button" @click="startRecording">
              <span class="text-xl">●</span>
              開始錄音
            </button>
          </template>

          <template v-if="isRecording">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <button class="btn-primary btn-secondary relative z-10" type="button" @click="pauseRecording">
                <span>{{ isPaused ? '▶' : '||' }}</span>
                {{ isPaused ? '繼續錄音' : '暫停錄音' }}
              </button>
              <button class="btn-primary btn-danger relative z-10" type="button" :class="{ 'record-btn-ring': !isPaused }" @click="stopRecording">
                <span>■</span>
                停止錄音
              </button>
            </div>
          </template>

          <template v-if="!isRecording && hasRecording">
            <button class="btn-primary relative z-10" type="button" @click="goToUpload">
              <span class="text-xl">↑</span>
              前往上傳
            </button>
            <button class="btn-primary btn-secondary relative z-10" type="button" @click="startRecording">
              <span>↻</span>
              重新錄音
            </button>
            <button class="relative z-10 py-2 text-center text-sm text-red-400" type="button" @click="discardRecording">
              捨棄這段錄音
            </button>
          </template>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>
