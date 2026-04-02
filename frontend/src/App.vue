<script setup>
import { ref, computed } from 'vue'
import { useMeetingStore } from './stores/meeting.js'
import RecordingScreen from './components/RecordingScreen.vue'
import UploadScreen from './components/UploadScreen.vue'
import Toast from './components/Toast.vue'

const store = useMeetingStore()
const toasts = ref([])

let toastId = 0

function showToast({ type, message }) {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 3500)
}

const currentComponent = computed(() => {
  if (store.currentView === 'upload') return UploadScreen
  return RecordingScreen
})
</script>

<template>
  <div class="min-h-screen min-h-dvh w-full relative overflow-hidden"
    style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);">

    <!-- Background decorations -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
        style="background: radial-gradient(circle, #6366f1, transparent)"></div>
      <div class="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-10"
        style="background: radial-gradient(circle, #3b82f6, transparent)"></div>
    </div>

    <!-- Step indicator -->
    <div class="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
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

    <!-- Main content -->
    <div class="relative z-10 max-w-md mx-auto h-screen h-dvh flex flex-col">
      <Transition name="view" mode="out-in">
        <component
          :is="currentComponent"
          :key="store.currentView"
          class="flex-1 flex flex-col"
          @toast="showToast"
        />
      </Transition>
    </div>

    <!-- Toast notifications -->
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
</style>
