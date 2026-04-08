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
  <div class="relative min-h-screen min-h-dvh w-full overflow-hidden" style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-10" style="background: radial-gradient(circle, #6366f1, transparent)"></div>
      <div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full opacity-10" style="background: radial-gradient(circle, #3b82f6, transparent)"></div>
    </div>

    <div v-if="showStepIndicator" class="absolute left-0 right-0 top-4 z-10 flex justify-center gap-2">
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
      type="button"
      @click="menuOpen = !menuOpen"
      class="absolute right-4 top-3 z-30 flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/40 transition-colors hover:bg-white/10 lg:right-5 lg:top-5"
      aria-label="選單"
    >
      <span class="block h-0.5 w-5 rounded bg-white/70 transition-all duration-300" :class="menuOpen ? 'translate-y-2 rotate-45' : ''" />
      <span class="block h-0.5 w-5 rounded bg-white/70 transition-all duration-300" :class="menuOpen ? 'opacity-0' : ''" />
      <span class="block h-0.5 w-5 rounded bg-white/70 transition-all duration-300" :class="menuOpen ? '-translate-y-2 -rotate-45' : ''" />
    </button>

    <Transition name="fade">
      <button
        v-if="menuOpen"
        type="button"
        class="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm"
        aria-label="關閉選單"
        @click="menuOpen = false"
      ></button>
    </Transition>

    <Transition name="slide-menu">
      <aside
        v-if="menuOpen"
        class="absolute right-0 top-0 z-30 flex h-full w-72 flex-col px-4 pb-8 pt-14 lg:w-80"
        style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%);"
      >
        <p class="mb-4 px-2 text-xs uppercase tracking-widest text-white/30">Menu</p>
        <nav class="flex flex-col gap-1">
          <button
            type="button"
            @click="openRecordingFlow"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
            :class="activeMenuPage === 'meeting' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">●</span>
            <div>
              <p class="text-sm font-medium leading-tight">會議錄音</p>
              <p class="mt-0.5 text-xs opacity-50">錄音完成後，接著送進 OpenClaw</p>
            </div>
          </button>

          <button
            type="button"
            @click="openDirectUploadFlow"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
            :class="activeMenuPage === 'upload-audio' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">↑</span>
            <div>
              <p class="text-sm font-medium leading-tight">直接上傳音檔</p>
              <p class="mt-0.5 text-xs opacity-50">匯入既有錄音檔並延續後續流程</p>
            </div>
          </button>

          <button
            type="button"
            @click="navigate('speakers')"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
            :class="activePage === 'speakers' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">👥</span>
            <div>
              <p class="text-sm font-medium leading-tight">Speaker 管理</p>
              <p class="mt-0.5 text-xs opacity-50">管理聲紋樣本與播放測試</p>
            </div>
          </button>

          <button
            type="button"
            @click="navigate('glossary')"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
            :class="activePage === 'glossary' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">詞</span>
            <div>
              <p class="text-sm font-medium leading-tight">詞彙管理</p>
              <p class="mt-0.5 text-xs opacity-50">維護專有名詞與常用詞</p>
            </div>
          </button>

          <button
            type="button"
            @click="navigate('openclaw')"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
            :class="activePage === 'openclaw' ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/10'"
          >
            <span class="text-xl">✦</span>
            <div>
              <p class="text-sm font-medium leading-tight">OpenClaw 對話</p>
              <p class="mt-0.5 text-xs opacity-50">查看整理結果並繼續提問</p>
            </div>
          </button>
        </nav>
      </aside>
    </Transition>

    <div class="relative z-10 mx-auto flex h-screen h-dvh w-full max-w-7xl flex-col px-0 sm:px-4 lg:px-6">
      <Transition name="view" mode="out-in">
        <component
          :is="currentComponent"
          :key="activePage === 'meeting' ? store.currentView : activePage"
          class="app-screen-shell flex-1"
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

:deep(.app-screen-shell) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

@media (min-width: 1024px) {
  :deep(.app-screen-shell) {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2rem;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.9));
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.36);
    backdrop-filter: blur(18px);
  }
}
</style>
