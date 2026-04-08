<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMeetingStore } from '../stores/meeting.js'
import { chatWithOpenClaw, getOpenClawHistory } from '../api/index.js'

const emit = defineEmits(['toast'])
const store = useMeetingStore()

const draft = ref('')
const sending = ref(false)
const loadingHistory = ref(false)
const pollHandle = ref(null)
const highlightHandle = ref(null)
const lastSignature = ref('')
const scrollViewport = ref(null)
const highlightedMessageId = ref('')
const expandedThoughtGroups = ref({})
const composerOffset = ref(0)

const hasPendingAssistantReply = computed(() => {
  const messages = store.conversationMessages
  if (!messages.length) return false

  const lastUserIndex = [...messages].map(message => message.role).lastIndexOf('user')
  if (lastUserIndex === -1) return false

  return !messages.slice(lastUserIndex + 1).some(message => (
    message.role === 'assistant'
    && !message.isThought
    && !message.isProcess
  ))
})

function buildSignature(messages) {
  return JSON.stringify(messages.map(message => [
    message.role,
    message.content,
    Boolean(message.isThought),
    Boolean(message.isProcess),
  ]))
}

function visibleMessages(messages) {
  const hiddenIds = new Set(store.conversationContext?.hiddenMessageIds || [])
  return (messages || []).filter(message => {
    if (!message?.id) return true
    return !hiddenIds.has(message.id)
  })
}

const conversationItems = computed(() => {
  const items = []
  let currentCollapsedGroup = null

  for (const message of store.conversationMessages) {
    const groupKind = getCollapsedGroupKind(message)

    if (groupKind) {
      if (!currentCollapsedGroup || currentCollapsedGroup.kind !== groupKind) {
        currentCollapsedGroup = {
          kind: groupKind,
          key: message.id || `${groupKind}-${items.length}`,
          messages: [],
        }
        items.push(currentCollapsedGroup)
      }

      currentCollapsedGroup.messages.push(message)
      continue
    }

    currentCollapsedGroup = null
    items.push({
      kind: 'message',
      key: message.id || `${message.role}:${message.content}:${items.length}`,
      message,
    })
  }

  return items
})

function getCollapsedGroupKind(message) {
  if (message?.isThought) return 'thought-group'
  if (!message?.isProcess) return null

  if (message.role === 'system') return 'system-group'
  if (message.role === 'toolResult' || message.role === 'tool') return 'tool-group'
  return 'process-group'
}

function isThoughtGroupExpanded(group) {
  return Boolean(expandedThoughtGroups.value[group.key])
}

function toggleThoughtGroup(group) {
  expandedThoughtGroups.value = {
    ...expandedThoughtGroups.value,
    [group.key]: !expandedThoughtGroups.value[group.key],
  }
}

function getGroupTitle(group) {
  if (group.kind === 'thought-group') return 'OpenClaw 思考訊息'
  if (group.kind === 'system-group') return 'OpenClaw 系統事件'
  if (group.kind === 'tool-group') return 'OpenClaw 工具輸出'
  return 'OpenClaw 執行過程'
}

function getGroupIcon(group) {
  if (group.kind === 'thought-group') return '思'
  if (group.kind === 'system-group') return '系'
  if (group.kind === 'tool-group') return '工'
  return '流'
}

function getGroupClasses(group) {
  if (group.kind === 'thought-group') {
    return {
      wrapper: 'border-amber-200/10 bg-amber-50/5 text-amber-50',
      badge: 'border-amber-200/20 bg-amber-300/15 text-amber-100',
      title: 'text-amber-100',
      meta: 'text-amber-100/60',
      action: 'text-amber-100/70',
      divider: 'border-amber-200/10',
      item: 'bg-black/15 text-amber-50/85',
    }
  }

  if (group.kind === 'system-group') {
    return {
      wrapper: 'border-sky-200/10 bg-sky-50/5 text-sky-50',
      badge: 'border-sky-200/20 bg-sky-300/15 text-sky-100',
      title: 'text-sky-100',
      meta: 'text-sky-100/60',
      action: 'text-sky-100/70',
      divider: 'border-sky-200/10',
      item: 'bg-black/15 text-sky-50/85',
    }
  }

  if (group.kind === 'tool-group') {
    return {
      wrapper: 'border-emerald-200/10 bg-emerald-50/5 text-emerald-50',
      badge: 'border-emerald-200/20 bg-emerald-300/15 text-emerald-100',
      title: 'text-emerald-100',
      meta: 'text-emerald-100/60',
      action: 'text-emerald-100/70',
      divider: 'border-emerald-200/10',
      item: 'bg-black/15 text-emerald-50/85',
    }
  }

  return {
    wrapper: 'border-violet-200/10 bg-violet-50/5 text-violet-50',
    badge: 'border-violet-200/20 bg-violet-300/15 text-violet-100',
    title: 'text-violet-100',
    meta: 'text-violet-100/60',
    action: 'text-violet-100/70',
    divider: 'border-violet-200/10',
    item: 'bg-black/15 text-violet-50/85',
  }
}

function scrollToLatest({ smooth = true } = {}) {
  const el = scrollViewport.value
  if (!el) return

  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

function flashLatestAssistant(messages, previousMessages) {
  const previousIds = new Set((previousMessages || []).map(message => message.id || `${message.role}:${message.content}`))
  const latestAssistant = [...messages].reverse().find(message => {
    const key = message.id || `${message.role}:${message.content}`
    return message.role === 'assistant' && !message.isThought && !message.isProcess && !previousIds.has(key)
  })

  if (!latestAssistant) return

  highlightedMessageId.value = latestAssistant.id || `${latestAssistant.role}:${latestAssistant.content}`

  if (highlightHandle.value) {
    window.clearTimeout(highlightHandle.value)
  }

  highlightHandle.value = window.setTimeout(() => {
    highlightedMessageId.value = ''
    highlightHandle.value = null
  }, 2600)
}

function updateComposerOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) {
    composerOffset.value = 0
    return
  }

  const viewport = window.visualViewport
  const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
  composerOffset.value = keyboardInset > 0 ? keyboardInset : 0
}

async function applyMessages(nextMessages, { smoothScroll = true } = {}) {
  const nextVisibleMessages = visibleMessages(nextMessages)
  const previousMessages = store.conversationMessages
  store.replaceConversationMessages(nextVisibleMessages)
  lastSignature.value = buildSignature(nextVisibleMessages)

  await nextTick()
  scrollToLatest({ smooth: smoothScroll })
  flashLatestAssistant(nextVisibleMessages, previousMessages)
}

async function refreshHistory() {
  if (loadingHistory.value) return

  loadingHistory.value = true
  try {
    const result = await getOpenClawHistory(store.openclawSessionId)
    if (result.sessionId) {
      store.openclawSessionId = result.sessionId
    }
    const nextMessages = visibleMessages(result.messages || [])
    const nextSignature = buildSignature(nextMessages)

    if (nextSignature !== lastSignature.value) {
      await applyMessages(nextMessages)
    }
  } catch (error) {
    emit('toast', { type: 'error', message: error.response?.data?.message || '無法更新對話紀錄' })
  } finally {
    loadingHistory.value = false
  }
}

async function sendMessage() {
  const message = draft.value.trim()
  if (!message || sending.value) return

  const optimisticMessages = [...store.conversationMessages, { role: 'user', content: message }]
  await applyMessages(optimisticMessages)
  draft.value = ''
  store.conversationDraft = ''
  sending.value = true

  try {
    const result = await chatWithOpenClaw({
      message,
      sessionId: store.openclawSessionId,
      context: store.conversationContext || {},
    })

    if (result.sessionId) {
      store.openclawSessionId = result.sessionId
    }

    const nextMessages = result.messages || optimisticMessages
    await applyMessages(nextMessages)
  } catch (error) {
    const nextMessages = [
      ...optimisticMessages,
      {
        role: 'assistant',
        content: `OpenClaw 對話失敗：${error.response?.data?.message || error.message}`,
      },
    ]
    await applyMessages(nextMessages)
    emit('toast', { type: 'error', message: 'OpenClaw 對話失敗' })
  } finally {
    sending.value = false
  }
}

function updatePolling() {
  if (pollHandle.value) {
    window.clearInterval(pollHandle.value)
    pollHandle.value = null
  }

  if (!store.openclawSessionId) return

  const intervalMs = hasPendingAssistantReply.value ? 2500 : 5000
  pollHandle.value = window.setInterval(async () => {
    if (sending.value) return
    await refreshHistory()
  }, intervalMs)
}

function stopPolling() {
  if (!pollHandle.value) return
  window.clearInterval(pollHandle.value)
  pollHandle.value = null
}

watch(() => store.openclawSessionId, () => {
  updatePolling()
})

watch(hasPendingAssistantReply, () => {
  updatePolling()
})

onMounted(async () => {
  draft.value = store.conversationDraft || ''
  lastSignature.value = buildSignature(store.conversationMessages)

  await nextTick()
  scrollToLatest({ smooth: false })
  updateComposerOffset()

  await refreshHistory()
  updatePolling()

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateComposerOffset)
    window.visualViewport.addEventListener('scroll', updateComposerOffset)
  }
})

watch(draft, (value) => {
  store.conversationDraft = value
})

onUnmounted(() => {
  stopPolling()
  if (highlightHandle.value) {
    window.clearTimeout(highlightHandle.value)
  }
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateComposerOffset)
    window.visualViewport.removeEventListener('scroll', updateComposerOffset)
  }
})
</script>

<template>
  <div class="flex h-full flex-col pt-14 lg:px-6 lg:pt-20">
    <div class="flex-1 min-h-0 px-3 pb-48 sm:px-4 sm:pb-52 lg:px-0 lg:pb-56" :style="{ paddingBottom: `calc(${composerOffset}px + 12rem)` }">
      <div ref="scrollViewport" class="mx-auto h-full max-w-5xl space-y-3 overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950/35 px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md scroll-smooth sm:px-5 lg:px-6 lg:py-6">
        <div
          v-for="(item, index) in conversationItems"
          :key="item.key || index"
          class="flex"
          :class="item.kind === 'message' && item.message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <template v-if="item.kind === 'message'">
            <div
              class="max-w-[92%] rounded-3xl px-4 py-3 text-[15px] leading-7 whitespace-pre-wrap break-all shadow-sm transition-all duration-500 sm:max-w-[82%] lg:max-w-[75%]"
              :class="[
                item.message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-100',
                highlightedMessageId === (item.message.id || `${item.message.role}:${item.message.content}`) ? 'ring-2 ring-cyan-300/70 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(103,232,249,0.35)]' : ''
              ]"
            >
              {{ item.message.content }}
            </div>
          </template>
          <div
            v-else
            class="max-w-[92%] overflow-hidden rounded-3xl border shadow-sm sm:max-w-[82%] lg:max-w-[75%]"
            :class="getGroupClasses(item).wrapper"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
              @click="toggleThoughtGroup(item)"
            >
              <div class="flex items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" :class="getGroupClasses(item).badge">
                  {{ getGroupIcon(item) }}
                </span>
                <div>
                  <p class="font-medium" :class="getGroupClasses(item).title">{{ getGroupTitle(item) }}</p>
                  <p class="mt-0.5 text-xs" :class="getGroupClasses(item).meta">{{ item.messages.length }} 則，預設收折</p>
                </div>
              </div>
              <span class="text-xs" :class="getGroupClasses(item).action">{{ isThoughtGroupExpanded(item) ? '收起' : '展開' }}</span>
            </button>

            <div v-if="isThoughtGroupExpanded(item)" class="space-y-2 border-t px-3 py-3" :class="getGroupClasses(item).divider">
              <div
                v-for="(thoughtMessage, thoughtIndex) in item.messages"
                :key="thoughtMessage.id || `${item.key}-${thoughtIndex}`"
                class="rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-all"
                :class="getGroupClasses(item).item"
              >
                {{ thoughtMessage.content }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="!store.conversationMessages.length" class="flex justify-start">
          <div class="max-w-[92%] rounded-3xl border border-white/8 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-400 sm:max-w-[82%] lg:max-w-[75%]">
            音檔已上傳完成，請先確認下方草稿內容，再自行送出給 OpenClaw。
          </div>
        </div>

        <div v-else-if="hasPendingAssistantReply" class="flex justify-start">
          <div class="max-w-[92%] rounded-3xl border border-white/8 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-400 sm:max-w-[82%] lg:max-w-[75%]">
            OpenClaw 處理中，正在等待新的回覆...
          </div>
        </div>
      </div>
    </div>

    <div
      class="absolute inset-x-0 bottom-0 z-10 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-4 sm:px-4 lg:px-6 lg:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      :style="{
        background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.92) 28%, rgba(15,23,42,0.98) 100%)',
        transform: composerOffset ? `translateY(-${composerOffset}px)` : 'translateY(0)',
      }"
    >
      <div class="mx-auto max-w-5xl rounded-[1.5rem] border border-white/10 bg-slate-950/75 px-3 py-2.5 shadow-2xl backdrop-blur-xl sm:px-4 sm:py-3 lg:px-5">
        <div class="mb-1.5 flex items-center justify-between px-1 text-[11px] text-slate-400">
          <span>{{ store.conversationContext?.skill || 'meeting-transcription' }}</span>
          <button class="text-slate-300 transition-colors hover:text-white" :disabled="loadingHistory" @click="refreshHistory">
            {{ loadingHistory ? '更新中...' : '重新整理' }}
          </button>
        </div>
        <textarea
          v-model="draft"
          rows="2"
          class="min-h-[52px] max-h-32 w-full resize-none bg-transparent text-[15px] leading-6 text-white outline-none placeholder:text-slate-500"
          placeholder="輸入你想補充給 OpenClaw 的內容..."
          @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
        <div class="mt-2 flex justify-end">
          <button class="btn-primary btn-block sm:w-auto sm:min-w-36" :disabled="sending || !draft.trim()" @click="sendMessage">
            {{ sending ? '傳送中...' : '送出訊息' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
