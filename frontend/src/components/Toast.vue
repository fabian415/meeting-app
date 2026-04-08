<script setup>
defineProps({
  toasts: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <div class="pointer-events-none fixed left-0 right-0 top-4 z-50 flex flex-col gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto mx-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
        :class="{
          'bg-emerald-500': toast.type === 'success',
          'bg-red-500': toast.type === 'error',
          'bg-blue-500': toast.type === 'info',
          'bg-amber-500': toast.type === 'warning',
        }"
      >
        <span class="shrink-0 text-xl">
          {{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '!' : toast.type === 'warning' ? '⚠' : 'i' }}
        </span>
        <p class="text-sm font-medium leading-snug text-white">{{ toast.message }}</p>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  animation: toast-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-leave-active {
  animation: toast-out 0.25s ease-in forwards;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-20px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes toast-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-10px) scale(0.95); }
}
</style>
