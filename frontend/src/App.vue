<script setup>
import { computed, ref, watch } from 'vue'
import { useMeetingStore } from './stores/meeting.js'
import RecordingScreen from './components/RecordingScreen.vue'
import DirectUploadScreen from './components/DirectUploadScreen.vue'
import UploadScreen from './components/UploadScreen.vue'
import ConversationScreen from './components/ConversationScreen.vue'
import SpeakerScreen from './components/SpeakerScreen.vue'
import GlossaryScreen from './components/GlossaryScreen.vue'
import Toast from './components/Toast.vue'

const store = useMeetingStore()
const toasts = ref([])
const menuOpen = ref(false)
const activePage = ref('meeting')

let toastId = 0

function showToast({ type, message }) {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 3500)
}

function navigate(page) {
  activePage.value = page
  menuOpen.value = false
}

function openRecordingFlow() {
  activePage.value = 'meeting'
  menuOpen.value = false
  if (store.currentView === 'file-select') {
    store.reset()
  }
}

function openDirectUploadFlow() {
  store.reset()
  store.currentView = 'file-select'
  activePage.value = 'meeting'
  menuOpen.value = false
}

const activeMenuPage = computed(() => {
  if (activePage.value !== 'meeting') return activePage.value
  return store.currentView === 'file-select' ? 'upload-audio' : 'meeting'
})

const currentComponent = computed(() => {
  if (activePage.value === 'openclaw') return ConversationScreen
  if (activePage.value === 'speakers') return SpeakerScreen
  if (activePage.value === 'glossary') return GlossaryScreen
  if (store.currentView === 'file-select') return DirectUploadScreen
  if (store.currentView === 'upload') return UploadScreen
  return RecordingScreen
})

const showStepIndicator = computed(() => activePage.value === 'meeting' && !['conversation', 'file-select'].includes(store.currentView))

watch(() => store.currentView, (value) => {
  if (value === 'conversation') {
    activePage.value = 'openclaw'
  }
})
</script>

<template>
  <div class="min-h-screen min-h-dvh w-full relative overflow-hidden"
    style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);">

    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
        style="background: radial-gradient(circle, #6366f1, transparent)"></div>
      <div class="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-10"
        style="background: radial-gradient(circle, #3b82f6, transparent)"></div>
    </div>

    <div v-if="showStepIndicator" class="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
      <div
        v-for="(step, i) in ['record', 'upload']"
        :key="step"
        class="h-1 rounded-full transition-all duration-500"
        :class="[
          store.currentView === step ? 'w-8 bg-blue-400' : 'w-4',
          store.currentView === 'upload' && i === 0 ? 'bg-blue-400/50' : 'bg-white/20'
        ]"
      ></div>
    </div>

    <button
      @click="menuOpen = !menuOpen"
      class="absolute top-3 right-4 z-30 w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-xl hover:bg-white/10 transition-colors"
      aria-label="選單"
    >
      <span class="block w-5 h-0.5 bg-white/70 rounded transition-all duration-300"
        :class="menuOpen ? 'rotate-45 translate-y-2' : ''" />
      <span class="block w-5 h-0.5 bg-white/70 rounded transition-all duration-300"
        :class="menuOpen ? 'opacity-0' : ''" />
      <span class="block w-5 h-0.5 bg-white/70 rounded transition-all duration-300"
        :class="menuOpen ? '-rotate-45 -translate-y-2' : ''" />
    </button>

    <Transition name="fade">
      <div
        v-if="menuOpen"
        class="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm"
        @click="menuOpen = false"
      />
    </Transition>

    <Transition name="slide-menu">
      <div
        v-if="menuOpen"
        class="absolute top-0 right-0 z-30 h-full w-72 flex flex-col pt-14 pb-8 px-4"
        style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%);"
      >
        <p class="text-white/30 text-xs uppercase tracking-widest mb-4 px-2">Menu</p>
        <nav class="flex flex-col gap-1">
          <button
            @click="openRecordingFlow"
            class="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
            :class="activeMenuPage === 'meeting' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">🎙️</span>
            <div>
              <p class="text-sm font-medium leading-tight">會議錄音</p>
              <p class="text-xs opacity-50 mt-0.5">錄音、上傳並交給 OpenClaw</p>
            </div>
          </button>
          <button
            @click="openDirectUploadFlow"
            class="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
            :class="activeMenuPage === 'upload-audio' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">📤</span>
            <div>
              <p class="text-sm font-medium leading-tight">上傳錄音檔</p>
              <p class="text-xs opacity-50 mt-0.5">輸入會議名稱後直接上傳既有音檔</p>
            </div>
          </button>
          <button
            @click="navigate('speakers')"
            class="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
            :class="activePage === 'speakers' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">🗣️</span>
            <div>
              <p class="text-sm font-medium leading-tight">Speaker 管理</p>
              <p class="text-xs opacity-50 mt-0.5">維護聲紋樣本</p>
            </div>
          </button>
          <button
            @click="navigate('glossary')"
            class="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
            :class="activePage === 'glossary' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">📚</span>
            <div>
              <p class="text-sm font-medium leading-tight">專有名詞</p>
              <p class="text-xs opacity-50 mt-0.5">維護辨識詞彙</p>
            </div>
          </button>
          <button
            @click="navigate('openclaw')"
            class="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
            :class="activePage === 'openclaw' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">💬</span>
            <div>
              <p class="text-sm font-medium leading-tight">OpenClaw 對話</p>
              <p class="text-xs opacity-50 mt-0.5">直接查看目前對話訊息</p>
            </div>
          </button>
        </nav>
      </div>
    </Transition>

    <div class="relative z-10 max-w-md mx-auto h-screen h-dvh flex flex-col">
      <Transition name="view" mode="out-in">
        <component
          :is="currentComponent"
          :key="activePage === 'meeting' ? store.currentView : activePage"
          class="flex-1 flex flex-col"
          @toast="showToast"
        />
      </Transition>
    </div>

    <Toast :toasts="toasts" />
  </div>
</template>

<style scoped>
.view-enter-active,
.view-leave-active {
  transition: all 0.3s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.view-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-menu-enter-active,
.slide-menu-leave-active {
  transition: transform 0.25s ease;
}
.slide-menu-enter-from,
.slide-menu-leave-to {
  transform: translateX(100%);
}
</style>
