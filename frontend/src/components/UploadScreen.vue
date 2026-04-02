<script setup>
import { ref, onMounted } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import { uploadMeeting } from '../api/index.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const status = ref('uploading') // 'uploading' | 'success' | 'error'
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

  // Simulate initial progress
  const progressInterval = setInterval(() => {
    if (progress.value < 80) progress.value += Math.random() * 8
  }, 300)

  try {
    const result = await uploadMeeting({
      audioBlob: store.audioBlob,
      meetingTitle: store.meetingTitle,
      meetingStartTime: store.meetingStartTime,
      meetingEndTime: store.meetingEndTime,
      audioDuration: store.audioDuration,
    })

    clearInterval(progressInterval)
    progress.value = 100
    status.value = 'success'
    uploadedFiles.value = result.files || []

    emit('toast', { type: 'success', message: '檔案已成功上傳至伺服器！' })
  } catch (err) {
    clearInterval(progressInterval)
    progress.value = 0
    status.value = 'error'
    errorMessage.value = err.response?.data?.message || err.message || '上傳失敗，請稍後再試'

    emit('toast', { type: 'error', message: errorMessage.value })
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
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-3 pt-8 pb-6 px-6">
      <button
        v-if="status !== 'uploading'"
        class="w-10 h-10 rounded-full flex items-center justify-center glass-card text-slate-300 active:scale-95 transition-transform flex-shrink-0"
        @click="goBack"
      >
        ←
      </button>
      <div>
        <h1 class="text-xl font-bold text-white">
          {{ status === 'uploading' ? '上傳中...' : status === 'success' ? '上傳成功' : '上傳失敗' }}
        </h1>
        <p v-if="store.meetingTitle" class="text-slate-400 text-xs mt-0.5">{{ store.meetingTitle }}</p>
      </div>
    </div>

    <div class="flex-1 flex flex-col items-center justify-center px-6 gap-6">

      <!-- Uploading state -->
      <template v-if="status === 'uploading'">
        <div class="flex flex-col items-center gap-6 w-full fade-in">
          <!-- Spinner -->
          <div class="relative w-28 h-28">
            <div class="w-28 h-28 rounded-full border-4 border-white/10"></div>
            <div
              class="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin-slow"
            ></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-4xl">📤</span>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="w-full glass-card p-4">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-slate-300">正在上傳至 FTP 伺服器...</span>
              <span class="text-blue-400 font-mono">{{ Math.round(progress) }}%</span>
            </div>
            <div class="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                style="background: linear-gradient(90deg, #3b82f6, #6366f1)"
                :style="{ width: progress + '%' }"
              ></div>
            </div>
          </div>

          <!-- File info -->
          <div class="w-full glass-card p-4 flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🎙</span>
              <div>
                <p class="text-white text-sm font-medium">錄音檔案</p>
                <p class="text-slate-400 text-xs">{{ formatBytes(store.audioBlob?.size) }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Success state -->
      <template v-if="status === 'success'">
        <div class="flex flex-col items-center gap-6 w-full fade-in">
          <!-- Success icon -->
          <div class="w-28 h-28 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
            <span class="text-5xl">✅</span>
          </div>

          <div class="text-center">
            <h2 class="text-white text-xl font-bold">上傳完成！</h2>
            <p class="text-slate-400 text-sm mt-1">檔案已成功傳送至遠端伺服器</p>
          </div>

          <!-- Uploaded files -->
          <div class="w-full glass-card p-4 flex flex-col gap-3">
            <p class="text-slate-300 text-sm font-medium mb-1">已上傳的檔案：</p>
            <div
              v-for="file in uploadedFiles"
              :key="file.name"
              class="flex items-center gap-3 py-2 border-t border-white/5"
            >
              <span class="text-emerald-400 text-lg">✓</span>
              <div class="min-w-0">
                <p class="text-white text-sm font-mono truncate">{{ file.name }}</p>
                <p class="text-slate-500 text-xs">{{ formatBytes(file.size) }}</p>
              </div>
            </div>
          </div>

          <button class="btn-primary" @click="startOver">
            <span>🔄</span>
            開始新的會議錄音
          </button>
        </div>
      </template>

      <!-- Error state -->
      <template v-if="status === 'error'">
        <div class="flex flex-col items-center gap-6 w-full fade-in">
          <!-- Error icon -->
          <div class="w-28 h-28 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center">
            <span class="text-5xl">❌</span>
          </div>

          <div class="text-center">
            <h2 class="text-white text-xl font-bold">上傳失敗</h2>
            <p class="text-slate-400 text-sm mt-1">無法連接至 FTP 伺服器</p>
          </div>

          <!-- Error details -->
          <div class="w-full glass-card p-4 border-red-500/30">
            <p class="text-red-300 text-sm font-medium mb-1">錯誤訊息：</p>
            <p class="text-red-200 text-sm font-mono leading-relaxed">{{ errorMessage }}</p>
          </div>

          <!-- Troubleshoot tips -->
          <div class="w-full glass-card p-4">
            <p class="text-slate-300 text-sm font-medium mb-2">🔧 排解建議</p>
            <ul class="text-slate-400 text-xs space-y-1.5 list-disc list-inside">
              <li>確認 <code class="text-blue-400">.env</code> 的 FTP 設定是否正確</li>
              <li>確認 FTP 伺服器是否正常運作</li>
              <li>確認網路連線是否穩定</li>
              <li>確認 FTP 帳號是否有寫入權限</li>
            </ul>
          </div>

          <div class="flex flex-col gap-3 w-full">
            <button class="btn-primary" @click="doUpload">
              <span>🔄</span>
              重試上傳
            </button>
            <button class="btn-primary btn-secondary" @click="startOver">
              開始新的會議錄音
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="h-8"></div>
  </div>
</template>
