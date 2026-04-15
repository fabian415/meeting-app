<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import {
  appendRecordingDraftChunk,
  canUseRecordingDraftStore,
  clearRecordingDraft,
  getRecordingDraft,
  startNextRecordingDraftSegment,
  startRecordingDraft,
  updateRecordingDraftMeta,
} from '../services/recordingDraftStore.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const isRecording = ref(false)
const isPaused = ref(false)
const hasRecording = ref(false)
const elapsedSeconds = ref(0)
const audioLevel = ref(0)
const waveHeights = ref(Array(9).fill(8))
const hasRecoverableDraft = ref(false)
const isLoadingDraft = ref(false)
const isFinishingDraft = ref(false)
const draftChunkCount = ref(0)
const draftUpdatedAt = ref('')
const confirmation = ref(null)

let mediaRecorder = null
let audioChunks = []
let pendingChunkWrites = []
let timerInterval = null
let analyserNode = null
let animationFrame = null
let audioContext = null
let activeStream = null
let activeMimeType = ''
let useDraftForActiveRecording = false
let activeSegmentId = 1

const formattedTime = computed(() => {
  const h = Math.floor(elapsedSeconds.value / 3600)
  const m = Math.floor((elapsedSeconds.value % 3600) / 60)
  const s = elapsedSeconds.value % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const draftUpdatedLabel = computed(() => {
  if (!draftUpdatedAt.value) return ''
  return new Date(draftUpdatedAt.value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

async function loadRecoverableDraft() {
  if (!canUseRecordingDraftStore() || store.audioBlob) return

  isLoadingDraft.value = true

  try {
    const draft = await getRecordingDraft()
    const hasChunks = draft.chunks.length > 0

    hasRecoverableDraft.value = hasChunks
    draftChunkCount.value = draft.chunks.length
    draftUpdatedAt.value = draft.meta?.updatedAt || ''

    if (!hasChunks || !draft.meta) return

    elapsedSeconds.value = Number(draft.meta.elapsedSeconds || 0)
    if (!store.meetingTitle && draft.meta.meetingTitle) {
      store.meetingTitle = draft.meta.meetingTitle
    }
    store.meetingStartTime = draft.meta.meetingStartTime || store.meetingStartTime
    store.meetingEndTime = draft.meta.meetingEndTime || null
  } catch (error) {
    emit('toast', { type: 'error', message: `無法讀取暫存錄音：${error.message}` })
  } finally {
    isLoadingDraft.value = false
  }
}

async function prepareRecordingDraft({ resume, mimeType }) {
  if (!canUseRecordingDraftStore()) {
    emit('toast', { type: 'info', message: '此瀏覽器無法使用錄音暫存，重新整理後可能無法恢復錄音。' })
    return { enabled: false, segmentId: 1 }
  }

  try {
    if (resume) {
      const segmentId = await startNextRecordingDraftSegment({
        mimeType,
        meetingTitle: store.meetingTitle,
        meetingStartTime: store.meetingStartTime,
        elapsedSeconds: elapsedSeconds.value,
      })
      return { enabled: true, segmentId }
    }

    await startRecordingDraft({
      mimeType,
      meetingTitle: store.meetingTitle,
      meetingStartTime: store.meetingStartTime,
      elapsedSeconds: elapsedSeconds.value,
    })
    return { enabled: true, segmentId: 1 }
  } catch (error) {
    emit('toast', { type: 'error', message: `錄音暫存無法啟用：${error.message}` })
    return { enabled: false, segmentId: 1 }
  }
}

async function startRecording({ resume = false } = {}) {
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      emit('toast', { type: 'error', message: '目前瀏覽器不支援線上錄音。' })
      return
    }

    const draft = resume && canUseRecordingDraftStore() ? await getRecordingDraft() : null
    const draftMimeType = draft?.meta?.mimeType || ''
    const mimeType = draftMimeType && MediaRecorder.isTypeSupported(draftMimeType)
      ? draftMimeType
      : getSupportedMimeType()

    if (resume && draftMimeType && mimeType !== draftMimeType) {
      emit('toast', { type: 'error', message: '目前瀏覽器不支援原本的錄音格式，無法安全續錄。' })
      return
    }

    const nextMeetingStartTime = !resume
      ? new Date().toISOString()
      : draft?.meta?.meetingStartTime || store.meetingStartTime || new Date().toISOString()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    activeStream = stream

    if (!resume) {
      elapsedSeconds.value = 0
      store.meetingStartTime = nextMeetingStartTime
      store.meetingEndTime = null
      hasRecoverableDraft.value = false
      draftChunkCount.value = 0
      draftUpdatedAt.value = ''
      if (store.audioBlob) store.setAudio(null, 0)
    } else if (draft?.meta) {
      elapsedSeconds.value = Number(draft.meta.elapsedSeconds || elapsedSeconds.value || 0)
      store.meetingStartTime = nextMeetingStartTime
      store.meetingEndTime = null
      if (!store.meetingTitle && draft.meta.meetingTitle) {
        store.meetingTitle = draft.meta.meetingTitle
      }
    }

    const draftStatus = await prepareRecordingDraft({ resume, mimeType: mimeType || 'audio/webm' })
    useDraftForActiveRecording = draftStatus.enabled
    activeSegmentId = draftStatus.segmentId

    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioContext.createMediaStreamSource(stream)
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 256
    source.connect(analyserNode)

    const options = mimeType ? { mimeType } : {}
    mediaRecorder = new MediaRecorder(stream, options)
    activeMimeType = mimeType || 'audio/webm'

    audioChunks = []
    pendingChunkWrites = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size <= 0) return

      audioChunks.push(event.data)
      if (useDraftForActiveRecording) {
        const write = appendRecordingDraftChunk(event.data, { segmentId: activeSegmentId }).catch(error => {
          emit('toast', { type: 'error', message: `錄音暫存失敗：${error.message}` })
        })
        pendingChunkWrites.push(write)
      }
    }

    mediaRecorder.onstop = async () => {
      await finalizeRecording()
    }

    hasRecording.value = false
    mediaRecorder.start(1000)
    isRecording.value = true
    isPaused.value = false

    timerInterval = window.setInterval(() => {
      if (isPaused.value) return

      elapsedSeconds.value += 1
      if (useDraftForActiveRecording) {
        updateRecordingDraftMeta({
          elapsedSeconds: elapsedSeconds.value,
          meetingTitle: store.meetingTitle,
          meetingStartTime: store.meetingStartTime,
        }).catch(() => {})
      }
    }, 1000)

    updateWaveform()
    emit('toast', { type: 'info', message: resume ? '已接續錄音...' : '開始錄音...' })
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      emit('toast', { type: 'error', message: '請先允許瀏覽器使用麥克風。' })
      return
    }
    stopActiveStream()
    emit('toast', { type: 'error', message: `無法開始錄音：${error.message}` })
  }
}

async function finalizeRecording() {
  clearInterval(timerInterval)
  timerInterval = null
  cancelAnimationFrame(animationFrame)

  await Promise.allSettled(pendingChunkWrites)
  pendingChunkWrites = []

  const meetingEndTime = store.meetingEndTime || new Date().toISOString()
  let chunks = audioChunks
  let mimeType = activeMimeType || 'audio/webm'
  let segments = [{ segmentId: activeSegmentId, blobs: audioChunks }]

  if (useDraftForActiveRecording) {
    try {
      await updateRecordingDraftMeta({
        elapsedSeconds: elapsedSeconds.value,
        meetingTitle: store.meetingTitle,
        meetingStartTime: store.meetingStartTime,
        meetingEndTime,
      })
      const draft = await getRecordingDraft()
      if (draft.chunks.length > 0) {
        chunks = draft.chunks
        segments = draft.segments
        mimeType = draft.meta?.mimeType || mimeType
      }
      draftChunkCount.value = draft.chunks.length
      draftUpdatedAt.value = draft.meta?.updatedAt || ''
    } catch (error) {
      emit('toast', { type: 'error', message: `無法合併暫存錄音，改用本次錄音片段：${error.message}` })
    }
  }

  if (chunks.length > 0) {
    const blob = await buildPlayableRecordingBlob({ chunks, segments, mimeType })
    store.setAudio(blob, elapsedSeconds.value)
    store.meetingEndTime = meetingEndTime
    hasRecording.value = true
    hasRecoverableDraft.value = false
  }

  stopActiveStream()
  resetAudioMeter()
  useDraftForActiveRecording = false
  activeSegmentId = 1
}

function stopActiveStream() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop())
    activeStream = null
  }

  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
}

function resetAudioMeter() {
  waveHeights.value = Array(9).fill(8)
  audioLevel.value = 0
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

async function finishRecoveredDraft() {
  if (!canUseRecordingDraftStore() || isFinishingDraft.value) return

  isFinishingDraft.value = true

  try {
    const draft = await getRecordingDraft()
    if (!draft.chunks.length) {
      emit('toast', { type: 'error', message: '找不到可恢復的錄音片段。' })
      return
    }

    const meetingEndTime = draft.meta?.meetingEndTime || new Date().toISOString()
    const blob = await buildPlayableRecordingBlob({
      chunks: draft.chunks,
      segments: draft.segments,
      mimeType: draft.meta?.mimeType || 'audio/webm',
    })
    elapsedSeconds.value = Number(draft.meta?.elapsedSeconds || elapsedSeconds.value || 0)
    store.meetingStartTime = draft.meta?.meetingStartTime || store.meetingStartTime
    store.meetingEndTime = meetingEndTime
    store.setAudio(blob, elapsedSeconds.value)
    hasRecording.value = true
    hasRecoverableDraft.value = false
    emit('toast', { type: 'success', message: `已恢復錄音，共 ${formattedTime.value}` })
  } catch (error) {
    emit('toast', { type: 'error', message: `無法恢復錄音：${error.message}` })
  } finally {
    isFinishingDraft.value = false
  }
}

function requestConfirmation(options) {
  confirmation.value = options
}

function closeConfirmation() {
  confirmation.value = null
}

async function confirmAction() {
  const action = confirmation.value?.action
  closeConfirmation()
  await action?.()
}

function requestRestartRecording() {
  requestConfirmation({
    title: '重新錄製？',
    message: '目前完成的錄音會被清除，並從 00:00 開始重新錄製。',
    confirmLabel: '確認重新錄製',
    action: () => startRecording(),
  })
}

function requestDiscardRecording() {
  requestConfirmation({
    title: hasRecoverableDraft.value && !hasRecording.value ? '捨棄暫存錄音？' : '捨棄這段錄音？',
    message: '這個動作會清除目前保存的錄音片段，完成後無法復原。',
    confirmLabel: '確認捨棄',
    action: () => discardRecording(),
  })
}

async function discardRecording() {
  hasRecording.value = false
  hasRecoverableDraft.value = false
  draftChunkCount.value = 0
  draftUpdatedAt.value = ''
  elapsedSeconds.value = 0
  store.setAudio(null, 0)
  store.meetingStartTime = null
  store.meetingEndTime = null
  audioChunks = []
  pendingChunkWrites = []
  useDraftForActiveRecording = false
  activeSegmentId = 1
  if (canUseRecordingDraftStore()) {
    try {
      await clearRecordingDraft()
    } catch (error) {
      emit('toast', { type: 'error', message: `無法清除暫存錄音：${error.message}` })
    }
  }
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

async function buildPlayableRecordingBlob({ chunks, segments, mimeType }) {
  const validSegments = (segments || []).filter(segment => segment.blobs?.length)

  if (validSegments.length <= 1) {
    return new Blob(chunks, { type: mimeType })
  }

  try {
    emit('toast', { type: 'info', message: '正在合併續錄片段，請稍候...' })
    return await buildWavFromSegments(validSegments, mimeType)
  } catch (error) {
    emit('toast', { type: 'error', message: `續錄片段轉換失敗，改用原始合併檔：${error.message}` })
    return new Blob(chunks, { type: mimeType })
  }
}

async function buildWavFromSegments(segments, mimeType) {
  const DecodeAudioContext = window.AudioContext || window.webkitAudioContext
  if (!DecodeAudioContext) {
    throw new Error('此瀏覽器無法解碼錄音片段')
  }

  const decodeContext = new DecodeAudioContext()

  try {
    const decodedBuffers = []

    for (const segment of segments) {
      const segmentBlob = new Blob(segment.blobs, { type: mimeType })
      const arrayBuffer = await segmentBlob.arrayBuffer()
      decodedBuffers.push(await decodeAudioData(decodeContext, arrayBuffer))
    }

    return encodeAudioBuffersToWav(decodedBuffers)
  } finally {
    await decodeContext.close().catch(() => {})
  }
}

function decodeAudioData(context, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const copy = arrayBuffer.slice(0)
    const result = context.decodeAudioData(copy, resolve, reject)
    if (result?.then) {
      result.then(resolve).catch(reject)
    }
  })
}

function encodeAudioBuffersToWav(buffers) {
  const sampleRate = buffers[0].sampleRate
  const channelCount = Math.min(2, Math.max(...buffers.map(buffer => buffer.numberOfChannels)))
  const totalFrames = buffers.reduce((total, buffer) => total + buffer.length, 0)
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = totalFrames * blockAlign
  const wavBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wavBuffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44

  buffers.forEach(buffer => {
    for (let frame = 0; frame < buffer.length; frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sourceChannel = channel < buffer.numberOfChannels ? channel : 0
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(sourceChannel)[frame] || 0))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += bytesPerSample
      }
    }
  })

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

onUnmounted(() => {
  clearInterval(timerInterval)
  cancelAnimationFrame(animationFrame)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  stopActiveStream()
})

onMounted(() => {
  hasRecording.value = !!store.audioBlob
  if (store.audioDuration) elapsedSeconds.value = store.audioDuration
  loadRecoverableDraft()
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
          <template v-else-if="hasRecoverableDraft">
            <div class="max-w-md text-center">
              <p class="text-sm font-medium text-amber-300">偵測到未完成錄音</p>
              <p class="mt-2 text-xs leading-relaxed text-slate-400">
                已保留 {{ formattedTime }}，可以接續錄製，或直接把已保存的片段合成音檔。
              </p>
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
            {{ isRecording ? (isPaused ? '錄音暫停中' : '正在錄音') : (hasRecording ? '已完成錄音' : (hasRecoverableDraft ? '可恢復錄音' : '尚未開始錄音')) }}
          </p>
          <p class="mt-1 text-sm text-slate-400">音量強度 {{ audioLevel }}%</p>
        </div>

        <div v-if="hasRecoverableDraft && !hasRecording && !isRecording" class="rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-4">
          <p class="text-sm font-medium text-amber-200">未完成錄音已暫存</p>
          <p class="mt-1 text-xs leading-relaxed text-amber-100/70">
            {{ draftChunkCount }} 個片段，長度約 {{ formattedTime }}{{ draftUpdatedLabel ? `，最後保存 ${draftUpdatedLabel}` : '' }}。
          </p>
        </div>

        <p class="text-xs leading-relaxed text-slate-500 lg:text-sm">
          錄音中會自動暫存片段。若網路切換造成頁面重載，回到此頁後可接續錄製，最後仍會合併成一個音檔上傳。
        </p>

        <div class="pointer-events-auto mt-auto flex flex-col gap-3">
          <template v-if="!isRecording && !hasRecording && !hasRecoverableDraft">
            <button class="btn-primary relative z-10" type="button" @click="startRecording()">
              <span class="text-xl">●</span>
              {{ isLoadingDraft ? '檢查暫存中...' : '開始錄音' }}
            </button>
          </template>

          <template v-if="!isRecording && !hasRecording && hasRecoverableDraft">
            <button class="btn-primary relative z-10" type="button" :disabled="isFinishingDraft" @click="startRecording({ resume: true })">
              <span class="text-xl">●</span>
              繼續錄製
            </button>
            <button class="btn-primary btn-secondary relative z-10" type="button" :disabled="isFinishingDraft" @click="finishRecoveredDraft">
              <span>■</span>
              {{ isFinishingDraft ? '正在合併...' : '直接完成並合併' }}
            </button>
            <button class="relative z-10 py-2 text-center text-sm text-red-400 disabled:opacity-40" type="button" :disabled="isFinishingDraft" @click="requestDiscardRecording">
              捨棄暫存錄音
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
            <button class="btn-primary btn-secondary relative z-10" type="button" @click="requestRestartRecording">
              <span>↻</span>
              重新錄音
            </button>
            <button class="relative z-10 py-2 text-center text-sm text-red-400" type="button" @click="requestDiscardRecording">
              捨棄這段錄音
            </button>
          </template>
        </div>
      </div>
      </div>
    </div>

    <div
      v-if="confirmation"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-lg border border-white/10 bg-slate-950 p-5 shadow-2xl">
        <h2 class="text-lg font-semibold text-white">{{ confirmation.title }}</h2>
        <p class="mt-2 text-sm leading-6 text-slate-300">{{ confirmation.message }}</p>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button class="btn-primary btn-secondary btn-block" type="button" @click="closeConfirmation">
            取消
          </button>
          <button class="btn-primary btn-danger btn-block" type="button" @click="confirmAction">
            {{ confirmation.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
