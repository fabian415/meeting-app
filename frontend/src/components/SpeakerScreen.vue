<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { listSpeakers, enrollSpeaker, deleteSpeaker } from '../api/index.js'

const emit = defineEmits(['toast'])

// State
const speakers = ref([])
const loading = ref(false)
const enrolling = ref(false)
const deletingName = ref(null)
const enrollCollapsed = ref(true)

// Playback state
const playingName = ref(null)   // name of speaker currently playing
const loadingAudio = ref(null)  // name of speaker whose audio is loading
const audioEl = ref(null)       // current Audio instance
const audioBlobUrl = ref(null)  // current blob URL

// Enroll form
const enrollName = ref('')
const audioFile = ref(null)
const audioDuration = ref(null)
const audioError = ref('')
const fileInputRef = ref(null)

const MIN_SEC = 1
const MAX_SEC = 120

async function fetchSpeakers() {
  loading.value = true
  try {
    const data = await listSpeakers()
    speakers.value = data.speakers || []
  } catch (e) {
    emit('toast', { type: 'error', message: '無法載入聲紋庫：' + (e.response?.data?.detail || e.message) })
  } finally {
    loading.value = false
  }
}

function handleFileChange(e) {
  const file = e.target.files[0]
  if (!file) return
  audioError.value = ''
  audioDuration.value = null
  audioFile.value = file

  const url = URL.createObjectURL(file)
  const audio = new Audio(url)
  audio.addEventListener('loadedmetadata', () => {
    URL.revokeObjectURL(url)
    audioDuration.value = audio.duration
    if (audio.duration < MIN_SEC) {
      audioError.value = `音檔太短（${audio.duration.toFixed(1)} 秒），請提供至少 ${MIN_SEC} 秒的錄音。`
    } else if (audio.duration > MAX_SEC) {
      audioError.value = `音檔太長（${audio.duration.toFixed(1)} 秒），請提供不超過 ${MAX_SEC} 秒的錄音。`
    }
  })
  audio.addEventListener('error', () => {
    URL.revokeObjectURL(url)
    audioError.value = '無法讀取音檔，請換一個檔案。'
  })
}

async function handleEnroll() {
  if (!enrollName.value.trim()) {
    emit('toast', { type: 'error', message: '請輸入 Speaker 姓名' })
    return
  }
  if (!audioFile.value) {
    emit('toast', { type: 'error', message: '請選擇音訊檔案' })
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
    audioFile.value = null
    audioDuration.value = null
    audioError.value = ''
    enrollCollapsed.value = true
    if (fileInputRef.value) fileInputRef.value.value = ''
    await fetchSpeakers()
  } catch (e) {
    emit('toast', { type: 'error', message: '註冊失敗：' + (e.response?.data?.detail || e.message) })
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
  } catch (e) {
    emit('toast', { type: 'error', message: '刪除失敗：' + (e.response?.data?.detail || e.message) })
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
  // If this speaker is already playing, stop it
  if (playingName.value === sp.name) {
    stopAudio()
    return
  }
  // If already loading this speaker, ignore
  if (loadingAudio.value === sp.name) return

  // Stop any current playback
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
      if (playingName.value === sp.name) stopAudio()
    })
    await audio.play()
  } catch (e) {
    emit('toast', { type: 'error', message: `無法播放 ${sp.name} 的音檔：${e.message}` })
    stopAudio()
  }
}

onMounted(fetchSpeakers)
onUnmounted(stopAudio)
</script>

<template>
  <div class="flex-1 flex flex-col overflow-y-auto px-4 pt-14 pb-6 sm:px-6 lg:px-8 lg:pt-20 lg:pb-8">

    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">聲紋庫</h1>
      <p class="text-sm text-white/50 mt-1">管理已註冊的 Speaker 聲紋</p>
    </div>

    <!-- Enroll Form -->
    <div class="grid gap-6 lg:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.05fr)] lg:items-start">
      <div class="glass-card rounded-2xl p-4 lg:sticky lg:top-4 lg:p-5">
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
        @click="enrollCollapsed = !enrollCollapsed"
      >
        <h2 class="text-base font-semibold text-white flex items-center gap-2">
          <span class="text-lg">🎙️</span>
          <span>新增 Speaker</span>
        </h2>
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-transform duration-200"
          :class="enrollCollapsed ? '' : 'rotate-180'"
        >
          ˅
        </span>
      </button>

      <Transition name="collapse">
        <div v-if="!enrollCollapsed" class="mt-4">
          <div class="mb-3">
            <label class="text-xs text-white/60 mb-1 block">Speaker 姓名</label>
            <input
              v-model="enrollName"
              type="text"
              placeholder="例如：Alice"
              :disabled="enrolling"
              class="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/60 transition-colors"
            />
          </div>

          <div class="mb-3">
            <label class="text-xs text-white/60 mb-1 block">聲紋音檔（{{ MIN_SEC }}–{{ MAX_SEC }} 秒）</label>
            <label class="flex items-center gap-3 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400/60 transition-colors"
              :class="{ 'opacity-50 pointer-events-none': enrolling }">
              <span class="text-blue-400 text-sm">📂</span>
              <span class="text-sm truncate" :class="audioFile ? 'text-white' : 'text-white/30'">
                {{ audioFile ? audioFile.name : '選擇音訊檔案…' }}
              </span>
              <input
                ref="fileInputRef"
                type="file"
                accept="audio/*"
                class="hidden"
                @change="handleFileChange"
              />
            </label>

            <div v-if="audioDuration !== null && !audioError" class="mt-1 text-xs text-green-400">
              時長：{{ audioDuration.toFixed(1) }} 秒 ✓
            </div>
            <div v-if="audioError" class="mt-1 text-xs text-red-400">
              {{ audioError }}
            </div>
          </div>

          <button
            @click="handleEnroll"
            :disabled="enrolling || !!audioError"
            class="btn-primary w-full rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg v-if="enrolling" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span>{{ enrolling ? '註冊中…' : '註冊聲紋' }}</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Speaker List -->
      <div class="glass-card rounded-2xl p-4 lg:min-h-[34rem] lg:p-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-white flex items-center gap-2">
          <span class="text-lg">👥</span> 已註冊 Speaker
        </h2>
        <button @click="fetchSpeakers" :disabled="loading" class="text-white/40 hover:text-white/70 transition-colors text-xs flex items-center gap-1">
          <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新整理
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-6">
        <svg class="w-6 h-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>

      <!-- Empty state -->
      <div v-else-if="speakers.length === 0" class="text-center py-6 text-white/30 text-sm">
        尚無已註冊的 Speaker
      </div>

      <!-- Speaker items -->
      <ul v-else class="space-y-2 overflow-y-auto max-h-[28rem] lg:max-h-[40rem]">
        <li
          v-for="sp in speakers"
          :key="sp.name"
          class="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-3"
        >
          <!-- Avatar -->
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {{ sp.name.charAt(0).toUpperCase() }}
          </div>

          <!-- Name & file -->
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">{{ sp.name }}</p>
            <p class="text-white/40 text-xs truncate">{{ sp.source_file }} · {{ sp.dim }}D</p>
          </div>

          <!-- Play button (only if has_audio) -->
          <button
            v-if="sp.has_audio"
            @click="togglePlay(sp)"
            :disabled="loadingAudio === sp.name"
            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-60"
            :class="playingName === sp.name
              ? 'text-blue-300 bg-blue-400/20 hover:bg-blue-400/30'
              : 'text-white/50 hover:text-blue-300 hover:bg-white/10'"
            :title="playingName === sp.name ? '停止播放' : '試聽'"
          >
            <!-- Loading spinner -->
            <svg v-if="loadingAudio === sp.name" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <!-- Pause icon -->
            <svg v-else-if="playingName === sp.name" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
            <!-- Play icon -->
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z"/>
            </svg>
          </button>

          <!-- Delete button -->
          <button
            @click="handleDelete(sp.name)"
            :disabled="deletingName === sp.name"
            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
            title="刪除"
          >
            <svg v-if="deletingName === sp.name" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  transition: all 0.22s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 420px;
}
</style>
