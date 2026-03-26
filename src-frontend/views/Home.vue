<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMailStore } from '@/stores/mail'
import { useToastStore } from '@/stores/toast'
import { api } from '@/services/api'
import {
  Mail, RefreshCw, Clock, Copy, Trash2, Plus, LogOut, 
  Timer, Inbox, Paperclip, Download, X, ChevronRight,
  Sparkles, Shield, Zap, FileText
} from 'lucide-vue-next'

const router = useRouter()
const mailStore = useMailStore()
const toast = useToastStore()

// 状态
const timerInterval = ref(null)
const refreshInterval = ref(null)
const showMail = ref(null)
const selectedDomain = ref('')
const customUsername = ref('')
const timerTick = ref(0)
const showDomainDropdown = ref(false)
const mailIframe = ref(null)
const showDeleteConfirm = ref(false)
const deletingAccount = ref(false)

// 计算属性
const formattedTime = computed(() => {
  timerTick.value
  if (!mailStore.expiresAt) return '30:00'
  const now = Date.now()
  const expires = new Date(mailStore.expiresAt).getTime()
  const diff = Math.max(0, expires - now)
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

const deleteAccountPreview = computed(() => (
  mailStore.email || (customUsername.value && selectedDomain.value
    ? `${customUsername.value}@${selectedDomain.value}`
    : '当前邮箱')
))

// 监听邮箱变化，更新输入框和域名选择
watch(() => mailStore.email, (email) => {
  if (email) {
    const [username, domain] = email.split('@')
    customUsername.value = username
    selectedDomain.value = domain
  }
}, { immediate: true })

// 监听邮件详情变化，注入 iframe 内容
watch(showMail, async (mail) => {
  if (mail?.html?.length > 0) {
    await nextTick()
    const iframe = mailIframe.value
    if (!iframe) return
    
    // 注入 HTML 内容到 iframe
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 16px; color: #333; }
            a { color: #8b5cf6; }
            img { max-width: 100%; }
          </style>
        </head>
        <body>${mail.html[0]}</body>
      </html>`)
    doc.close()
    // 自适应高度
    iframe.onload = () => {
      try {
        const height = doc.body.scrollHeight
        iframe.style.height = Math.min(height + 32, 500) + 'px'
      } catch (e) {}
    }
  }
})

watch(showDeleteConfirm, (visible) => {
  document.body.style.overflow = visible ? 'hidden' : ''
})

// 初始化
onMounted(async () => {
  await loadDomains()
  
  // 点击外部关闭下拉菜单
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleGlobalKeydown)
  
  if (mailStore.isAuthenticated && !mailStore.isExpired) {
    startTimer()
    startAutoRefresh()
    await refreshMails()
  }
})

onUnmounted(() => {
  stopTimer()
  stopAutoRefresh()
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.body.style.overflow = ''
})

function handleClickOutside(e) {
  const dropdown = document.querySelector('.domain-dropdown')
  if (dropdown && !dropdown.contains(e.target)) {
    showDomainDropdown.value = false
  }
}

function handleGlobalKeydown(e) {
  if (e.key === 'Escape' && showDeleteConfirm.value && !deletingAccount.value) {
    closeDeleteConfirm()
  }
}

// 方法
async function loadDomains() {
  try {
    const domains = await api.getDomains()
    mailStore.setDomains(domains)
    if (domains.length > 0 && !selectedDomain.value) {
      selectedDomain.value = domains[0].domain
    }
  } catch (e) {
    console.error('Failed to load domains:', e)
  }
}

async function createNewEmail() {
  if (mailStore.domains.length === 0) {
    toast.error('暂无可用域名')
    return
  }
  
  try {
    mailStore.setLoading(true)
    
    // 如果有现有邮箱，先删除
    if (mailStore.emailId && mailStore.token) {
      try {
        await api.deleteAccount(mailStore.emailId, mailStore.token)
      } catch (e) {
        // 忽略删除失败
      }
    }
    
    // 清空邮件列表和详情
    mailStore.setMails([])
    showMail.value = null
    
    // 检测输入框是否被修改
    const currentUsername = mailStore.email ? mailStore.email.split('@')[0] : ''
    const isModified = customUsername.value.trim() && customUsername.value.trim() !== currentUsername
    
    // 根据是否修改选择创建方式
    let data
    if (isModified) {
      // 输入框被修改 → 创建自定义邮箱
      const address = `${customUsername.value.trim()}@${selectedDomain.value}`
      data = await api.createCustomEmail(address)
    } else {
      // 输入框未修改或为空 → 创建随机邮箱
      data = await api.generateRandomEmail(selectedDomain.value || null)
      // 更新输入框显示
      const [username, domain] = data.address.split('@')
      customUsername.value = username
      selectedDomain.value = domain
    }
    
    mailStore.setSession(data)
    startTimer()
    startAutoRefresh()
    toast.success('邮箱创建成功')
  } catch (e) {
    toast.error(e.message || '创建失败，请重试')
  } finally {
    mailStore.setLoading(false)
  }
}

async function refreshMails() {
  if (!mailStore.token) return
  try {
    const { mails } = await api.getMessages(mailStore.token)
    mailStore.setMails(mails)
  } catch (e) {
    console.error('Failed to load mails:', e)
  }
}

async function openMail(mail) {
  try {
    const fullMail = await api.getMessage(mail.id, mailStore.token)
    showMail.value = fullMail
    
    if (!mail.seen) {
      await api.markAsRead(mail.id, mailStore.token)
      await refreshMails()
    }
  } catch (e) {
    toast.error('加载邮件失败')
  }
}

async function deleteMail() {
  if (!showMail.value) return
  
  try {
    await api.deleteMessage(showMail.value.id, mailStore.token)
    showMail.value = null
    await refreshMails()
    toast.success('邮件已删除')
  } catch (e) {
    toast.error('删除失败')
  }
}

function requestDeleteAccount() {
  if (!mailStore.email || !mailStore.emailId || !mailStore.token || deletingAccount.value) return
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  if (deletingAccount.value) return
  showDeleteConfirm.value = false
}

async function confirmDeleteAccount() {
  if (!mailStore.emailId || !mailStore.token || deletingAccount.value) return

  deletingAccount.value = true
  try {
    await api.deleteAccount(mailStore.emailId, mailStore.token)
    showDeleteConfirm.value = false
    mailStore.clearSession()
    mailStore.setMails([])
    customUsername.value = ''
    stopTimer()
    stopAutoRefresh()
    showMail.value = null
    toast.success('邮箱已删除')
  } catch (e) {
    toast.error('删除失败')
  } finally {
    deletingAccount.value = false
  }
}

async function extendTime() {
  if (!mailStore.token) return
  try {
    const data = await api.extendExpiry(mailStore.token, 30)
    mailStore.expiresAt = data.expiresAt
    localStorage.setItem('tm_expiresAt', data.expiresAt)
    toast.success('已延长 30 分钟')
  } catch (e) {
    toast.error('延长失败')
  }
}

async function copyEmail() {
  if (!customUsername.value || !selectedDomain.value) return
  const email = `${customUsername.value}@${selectedDomain.value}`
  
  try {
    await navigator.clipboard.writeText(email)
    toast.success('已复制到剪贴板')
  } catch (e) {
    toast.error('复制失败')
  }
}

function logout() {
  showDeleteConfirm.value = false
  deletingAccount.value = false
  mailStore.clearSession()
  mailStore.setMails([])
  customUsername.value = ''
  stopTimer()
  stopAutoRefresh()
  sessionStorage.removeItem('auth')
  router.push('/login')
}

function openDocs() {
  router.push('/docs')
}

function startTimer() {
  stopTimer()
  timerInterval.value = setInterval(() => {
    timerTick.value++
    
    if (mailStore.isExpired) {
      stopTimer()
      stopAutoRefresh()
      toast.error('邮箱已过期')
    }
  }, 1000)
}

function stopTimer() {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshInterval.value = setInterval(refreshMails, 10000)
}

function stopAutoRefresh() {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString()
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getInitial(name) {
  return (name || '?')[0].toUpperCase()
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- 顶部栏 -->
    <header class="sticky top-0 z-40 border-b border-white/5 bg-dark-950/90 backdrop-blur-xl">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <!-- Logo -->
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Mail class="w-4 h-4 text-white" />
          </div>
          <span class="font-bold text-gradient">DriftMail</span>
        </div>
        
        <!-- 剩余时间 -->
        <div v-if="mailStore.email" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Timer class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-mono font-medium text-amber-500">{{ formattedTime }}</span>
        </div>
        
        <!-- 操作 -->
        <div class="flex items-center gap-2">
          <button v-if="mailStore.email" @click="extendTime" class="btn-ghost btn-sm">
            <Sparkles class="w-4 h-4" />
            <span class="hidden sm:inline">延长</span>
          </button>
          <button @click="openDocs" class="btn-ghost btn-sm">
            <FileText class="w-4 h-4" />
            <span class="hidden sm:inline">API 文档</span>
          </button>
          <button @click="logout" class="btn-ghost btn-icon btn-sm">
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
    
    <!-- 主内容 -->
    <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <!-- 邮箱地址卡片 -->
      <div class="card p-6 mb-6 relative z-10">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <!-- 左侧：输入框 + 域名选择 -->
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
              <Shield class="w-6 h-6 text-white" />
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="customUsername"
                type="text"
                class="input text-sm font-mono"
                style="width: 140px;"
                placeholder="邮箱名"
                maxlength="30"
              />
              <span class="text-dark-400 font-medium">@</span>
              <!-- 自定义域名下拉菜单 -->
              <div class="relative domain-dropdown">
                <button
                  @click="showDomainDropdown = !showDomainDropdown"
                  class="input text-sm flex items-center justify-between gap-2 cursor-pointer"
                  style="min-width: 140px;"
                >
                  <span class="truncate">{{ selectedDomain || '选择域名' }}</span>
                  <ChevronRight class="w-4 h-4 text-dark-400 transition-transform" :class="showDomainDropdown ? 'rotate-90' : ''" />
                </button>
                <!-- 下拉列表 -->
                <Transition name="dropdown">
                  <div
                    v-if="showDomainDropdown"
                    class="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-white/10 rounded-xl overflow-hidden shadow-xl z-50"
                  >
                    <button
                      v-for="d in mailStore.domains"
                      :key="d.id"
                      @click="selectedDomain = d.domain; showDomainDropdown = false"
                      class="w-full px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
                      :class="d.domain === selectedDomain ? 'text-primary-400 bg-primary-500/10' : 'text-dark-200'"
                    >
                      {{ d.domain }}
                    </button>
                  </div>
                </Transition>
              </div>
              <button @click="copyEmail" class="btn-ghost btn-icon btn-sm">
                <Copy class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <!-- 右侧操作 -->
          <div class="flex items-center gap-2">
            <button @click="createNewEmail" class="btn-primary btn-sm">
              <Plus class="w-4 h-4" />
              <span>新建邮箱</span>
            </button>
            <button @click="requestDeleteAccount" class="btn-danger btn-sm">
              <Trash2 class="w-4 h-4" />
              <span>删除邮箱</span>
            </button>
          </div>
        </div>
        
        <!-- 统计栏 -->
        <div class="flex items-center justify-between mt-4 pt-4 border-t border-white/5 text-sm text-dark-400">
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-1.5">
              <Inbox class="w-4 h-4" />
              <span>{{ mailStore.mails.length }} 封邮件</span>
            </div>
            <div class="flex items-center gap-1.5">
              <Mail class="w-4 h-4" />
              <span>{{ mailStore.mails.filter(m => !m.seen).length }} 未读</span>
            </div>
            <div v-if="refreshInterval" class="flex items-center gap-1.5">
              <Zap class="w-4 h-4 text-emerald-400" />
              <span class="text-emerald-400">自动刷新中</span>
            </div>
          </div>
          <button @click="refreshMails" class="btn-ghost btn-sm">
            <RefreshCw class="w-4 h-4" />
            <span>刷新</span>
          </button>
        </div>
      </div>
      
      <!-- 邮件区域 - 自动占据剩余空间 -->
      <div class="card flex-1 flex flex-col">
        <!-- 邮件列表视图 -->
        <div v-if="!showMail">
          <div class="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h2 class="font-semibold flex items-center gap-2">
              <Inbox class="w-4 h-4 text-dark-400" />
              收件箱
            </h2>
            <span class="text-xs text-dark-500">{{ mailStore.mails.length }} 封</span>
          </div>
          
          <div class="flex-1 overflow-y-auto">
            <template v-if="mailStore.mails.length > 0">
              <div
                v-for="mail in mailStore.mails"
                :key="mail.id"
                @click="openMail(mail)"
                class="px-4 py-3 border-b border-white/5 cursor-pointer transition-colors flex items-start gap-3 hover:bg-white/[0.02]"
                :class="!mail.seen ? 'bg-white/[0.02]' : ''"
              >
                <!-- 未读点 -->
                <div 
                  class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  :class="mail.seen ? 'bg-transparent' : 'bg-primary-500'"
                />
                
                <!-- 内容 -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2 mb-0.5">
                    <span class="text-sm font-medium truncate" :class="mail.seen ? 'text-dark-300' : 'text-dark-100'">
                      {{ mail.from.name || mail.from.address }}
                    </span>
                    <span class="text-xs text-dark-500 flex-shrink-0">{{ formatTime(mail.createdAt) }}</span>
                  </div>
                  <div class="text-sm truncate" :class="mail.seen ? 'text-dark-500' : 'text-dark-300'">
                    {{ mail.subject || '(无主题)' }}
                  </div>
                  <div v-if="mail.hasAttachments" class="flex items-center gap-1 mt-1">
                    <Paperclip class="w-3 h-3 text-dark-500" />
                    <span class="text-xs text-dark-500">有附件</span>
                  </div>
                </div>
                
                <ChevronRight class="w-4 h-4 text-dark-600 flex-shrink-0" />
              </div>
            </template>
            
            <template v-else>
              <div class="flex flex-col items-center justify-center text-dark-500 py-16">
                <Inbox class="w-16 h-16 mb-4 opacity-20" />
                <p class="text-dark-400 mb-1">暂无邮件</p>
                <p class="text-sm">新邮件将自动显示</p>
              </div>
            </template>
          </div>
        </div>
        
        <!-- 邮件详情视图 -->
        <div v-else class="flex flex-col">
          <!-- 返回栏 -->
          <div class="px-4 py-3 border-b border-white/5 flex items-center gap-3">
            <button @click="showMail = null" class="btn-ghost btn-sm">
              <ChevronRight class="w-4 h-4 rotate-180" />
              <span>返回列表</span>
            </button>
            <div class="flex-1" />
            <button @click="deleteMail" class="btn-danger btn-sm">
              <Trash2 class="w-4 h-4" />
              <span>删除</span>
            </button>
          </div>
          
          <!-- 邮件头 -->
          <div class="px-4 py-4 border-b border-white/5">
            <h3 class="font-semibold text-lg mb-3">{{ showMail.subject || '(无主题)' }}</h3>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold">
                {{ getInitial(showMail.from.name || showMail.from.address) }}
              </div>
              <div>
                <div class="font-medium text-sm">{{ showMail.from.name || '未知发件人' }}</div>
                <div class="text-xs text-dark-500">{{ showMail.from.address }}</div>
              </div>
              <div class="ml-auto text-xs text-dark-500">
                {{ formatDateTime(showMail.createdAt) }}
              </div>
            </div>
          </div>
          
          <!-- 邮件内容 -->
          <div class="flex-1 overflow-y-auto p-4">
            <iframe
              v-if="showMail.html?.length > 0"
              ref="mailIframe"
              class="w-full bg-white rounded-lg border-0"
              style="min-height: 300px;"
              sandbox="allow-same-origin"
            />
            <div v-else-if="showMail.text" class="text-sm text-dark-300 leading-relaxed whitespace-pre-wrap">
              {{ showMail.text }}
            </div>
            <div v-else class="text-dark-500 text-sm">无内容</div>
          </div>
          
          <!-- 附件 -->
          <div v-if="showMail.attachments?.length > 0" class="px-4 py-3 border-t border-white/5">
            <div class="text-xs text-dark-500 mb-2">附件 ({{ showMail.attachments.length }})</div>
            <div class="space-y-1.5">
              <a
                v-for="att in showMail.attachments"
                :key="att.id"
                :href="api.getAttachmentUrl(att.id)"
                :download="att.filename"
                target="_blank"
                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 transition-colors"
              >
                <Download class="w-4 h-4 text-dark-400" />
                <span class="text-sm truncate flex-1">{{ att.filename }}</span>
                <span class="text-xs text-dark-500">{{ formatSize(att.size) }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteConfirm"
          class="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 sm:px-6"
          @click.self="closeDeleteConfirm"
        >
          <div class="absolute inset-0 bg-dark-950/84 backdrop-blur-md" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            class="delete-dialog relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-dark-900/95 p-6 shadow-[0_32px_90px_rgba(2,6,23,0.6)]"
          >
            <div class="delete-dialog-glow" />
            <button
              type="button"
              class="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-dark-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="deletingAccount"
              @click="closeDeleteConfirm"
            >
              <X class="h-4 w-4" />
            </button>

            <div class="relative">
              <div class="flex items-start gap-4">
                <div class="delete-dialog-icon flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[20px] border border-rose-400/20 bg-gradient-to-br from-rose-500/25 via-rose-500/10 to-orange-400/15 text-rose-200">
                  <Trash2 class="h-6 w-6" />
                </div>
                <div class="min-w-0 pt-1">
                  <p class="text-[11px] font-medium uppercase tracking-[0.32em] text-rose-300/75">Danger Zone</p>
                  <h3 id="delete-account-title" class="mt-2 text-xl font-semibold text-white">删除当前邮箱</h3>
                  <p class="mt-2 text-sm leading-6 text-dark-300">
                    删除后会立即清空当前邮箱和已接收邮件，且无法恢复。
                  </p>
                </div>
              </div>

              <div class="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <div class="text-[11px] uppercase tracking-[0.28em] text-dark-500">当前地址</div>
                <div class="mt-3 flex items-center gap-3">
                  <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-primary-300">
                    <Mail class="h-4 w-4" />
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-white">{{ deleteAccountPreview }}</div>
                    <div class="mt-1 text-xs text-dark-400">删除后需重新创建邮箱才能继续接收邮件。</div>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-2xl border border-rose-500/15 bg-rose-500/6 px-4 py-3">
                <div class="flex items-center gap-2 text-sm text-rose-100/90">
                  <span class="h-1.5 w-1.5 rounded-full bg-rose-300" />
                  <span>邮箱地址和收件内容会一起删除</span>
                </div>
                <div class="mt-2 flex items-center gap-2 text-sm text-amber-100/85">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  <span>这是不可撤销操作，请确认后再继续</span>
                </div>
              </div>

              <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  class="btn-ghost btn-sm sm:min-w-[112px] disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="deletingAccount"
                  @click="closeDeleteConfirm"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="btn-danger btn-sm sm:min-w-[148px] disabled:cursor-wait disabled:opacity-60"
                  :disabled="deletingAccount"
                  @click="confirmDeleteAccount"
                >
                  <Trash2 class="w-4 h-4" />
                  <span>{{ deletingAccount ? '正在删除...' : '确认删除' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    
    <!-- 底部 -->
    <footer class="border-t border-white/5 py-3">
      <div class="max-w-6xl mx-auto px-4 text-center text-xs text-dark-600">
        基于 Cloudflare Workers 构建 · 数据自动过期删除
      </div>
    </footer>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.24s ease;
}

.modal-enter-active .delete-dialog,
.modal-leave-active .delete-dialog {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .delete-dialog,
.modal-leave-to .delete-dialog {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}

.delete-dialog {
  backdrop-filter: blur(28px);
}

.delete-dialog::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 27px;
  background: linear-gradient(145deg, rgba(244, 63, 94, 0.12), rgba(255, 255, 255, 0.03) 42%, rgba(59, 130, 246, 0.06));
  pointer-events: none;
}

.delete-dialog-glow {
  position: absolute;
  top: -72px;
  right: -48px;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.36), rgba(244, 63, 94, 0));
  pointer-events: none;
}

.delete-dialog-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 18px 40px rgba(244, 63, 94, 0.18);
}
</style>
