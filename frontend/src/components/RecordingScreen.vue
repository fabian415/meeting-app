<script setup>
import { ref, onUnmounted, computed } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const isRecording = ref(false)
const isPaused = ref(false)
const hasRecording = ref(false)
const elapsedSeconds = ref(0)
const audioLevel = ref(0)

let mediaRecorder = null
let audioChunks = []
let timerInterval = null
let analyserNode = null
let animationFrame = null
let audioContext = null
let recordingStartTime = 0

const formattedTime = computed(() => {
  const h = Math.floor(elapsedSeconds.value / 3600)
  const m = Math.floor((elapsedSeconds.value % 3600) / 60)
  const s = elapsedSeconds.value % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const waveHeights = ref(Array(9).fill(8))

function updateWaveform() {
  if (!analyserNode) return
  const data = new Uint8Array(analyserNode.frequencyBinCount)
  analyserNode.getByteFrequencyData(data)

  const step = Math.floor(data.length / 9)
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
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' })
      store.setAudio(blob, elapsedSeconds.value)
      hasRecording.value = true

      stream.getTracks().forEach(t => t.stop())
      if (audioContext) {
        audioContext.close()
        audioContext = null
      }
      waveHeights.value = Array(9).fill(8)
      audioLevel.value = 0
    }

    mediaRecorder.start(100)
    isRecording.value = true
    isPaused.value = false
    recordingStartTime = Date.now()
    store.meetingStartTime = new Date().toISOString()
    store.meetingEndTime = null

    timerInterval = setInterval(() => {
      if (!isPaused.value) elapsedSeconds.value++
    }, 1000)

    updateWaveform()
    emit('toast', { type: 'info', message: '開始錄音...' })
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      emit('toast', { type: 'error', message: '請允許麥克風存取權限' })
    } else {
      emit('toast', { type: 'error', message: '無法啟動錄音: ' + err.message })
    }
  }
}

function pauseRecording() {
  if (!mediaRecorder) return
  if (isPaused.value) {
    mediaRecorder.resume()
    isPaused.value = false
    updateWaveform()
    emit('toast', { type: 'info', message: '繼續錄音' })
  } else {
    mediaRecorder.pause()
    isPaused.value = true
    cancelAnimationFrame(animationFrame)
    waveHeights.value = Array(9).fill(8)
    emit('toast', { type: 'info', message: '錄音已暫停' })
  }
}

function stopRecording() {
  if (!mediaRecorder) return
  clearInterval(timerInterval)
  cancelAnimationFrame(animationFrame)
  store.meetingEndTime = new Date().toISOString()
  mediaRecorder.stop()
  isRecording.value = false
  isPaused.value = false
  emit('toast', { type: 'success', message: `錄音完成（${formattedTime.value}）` })
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
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
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
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="text-center pt-8 pb-4 px-6">
      <h1 class="text-2xl font-bold text-white tracking-tight">🎙 會議室小助手</h1>
      <p class="text-slate-400 text-sm mt-1">點選下方按鈕開始錄音</p>
    </div>

    <!-- Meeting title input -->
    <div class="px-6 pb-2">
      <input
        v-model="store.meetingTitle"
        :disabled="isRecording"
        type="text"
        placeholder="輸入會議名稱（將作為檔名）"
        class="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
        style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);"
        :style="isRecording ? 'opacity:0.4;cursor:not-allowed' : ''"
      />
    </div>

    <!-- Waveform area -->
    <div class="flex-1 flex flex-col items-center justify-center px-6 gap-6">
      <!-- Waveform visualizer -->
      <div class="glass-card w-full py-6 px-4 flex items-center justify-center gap-1.5 min-h-24">
        <template v-if="isRecording && !isPaused">
          <div
            v-for="(h, i) in waveHeights"
            :key="i"
            class="waveform-bar transition-all duration-75"
            :style="{ height: h + 'px' }"
          />
        </template>
        <template v-else-if="isPaused">
          <div class="flex items-center gap-2 text-amber-400">
            <span class="text-2xl">⏸</span>
            <span class="text-sm font-medium">錄音暫停中</span>
          </div>
        </template>
        <template v-else-if="hasRecording">
          <div class="w-full">
            <p class="text-center text-emerald-400 text-sm mb-3 font-medium">✅ 錄音完成</p>
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
            <div class="flex items-end gap-1.5 h-12">
              <div v-for="h in [16, 28, 40, 32, 48, 24, 36, 20, 32]" :key="h"
                class="waveform-bar" :style="{ height: h + 'px' }" />
            </div>
            <p class="text-slate-400 text-xs mt-2">等待錄音...</p>
          </div>
        </template>
      </div>

      <!-- Timer -->
      <div class="text-center">
        <div
          class="text-5xl font-mono font-bold tracking-widest"
          :class="isRecording && !isPaused ? 'text-red-400' : 'text-white'"
        >
          {{ formattedTime }}
        </div>
        <p v-if="isRecording" class="text-xs mt-1.5"
          :class="isPaused ? 'text-amber-400' : 'text-red-400 animate-pulse'">
          {{ isPaused ? '暫停中' : '● 錄音中' }}
        </p>
      </div>

      <!-- Controls -->
      <div class="w-full flex flex-col gap-3">
        <!-- Not recording, no recording -->
        <template v-if="!isRecording && !hasRecording">
          <button class="btn-primary" @click="startRecording">
            <span class="text-xl">🎙</span>
            開始錄音
          </button>
        </template>

        <!-- Recording in progress -->
        <template v-if="isRecording">
          <div class="flex gap-3">
            <button
              class="btn-primary btn-secondary flex-1"
              @click="pauseRecording"
            >
              <span>{{ isPaused ? '▶️' : '⏸' }}</span>
              {{ isPaused ? '繼續' : '暫停' }}
            </button>
            <button
              class="btn-primary btn-danger flex-1"
              :class="{ 'record-btn-ring': !isPaused }"
              @click="stopRecording"
            >
              <span>⏹</span>
              停止錄音
            </button>
          </div>
        </template>

        <!-- Recording done -->
        <template v-if="!isRecording && hasRecording">
          <button class="btn-primary" @click="goToUpload">
            <span class="text-xl">📤</span>
            下一步：上傳錄音
          </button>
          <button class="btn-primary btn-secondary" @click="startRecording">
            <span>🔄</span>
            重新錄音
          </button>
          <button
            class="text-red-400 text-sm py-2 text-center"
            @click="discardRecording"
          >
            捨棄此次錄音
          </button>
        </template>
      </div>
    </div>

    <!-- Tip -->
    <div class="px-6 pb-8">
      <p class="text-slate-500 text-xs text-center leading-relaxed">
        錄音完成後將自動上傳至遠端伺服器
      </p>
    </div>
  </div>
</template>
