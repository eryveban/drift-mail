<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMailStore } from '@/stores/mail'
import { extractApiDocSections, renderApiDocHtml } from '@/utils/api-doc'
import apiDocMarkdown from '../../API.md?raw'
import { BookText, ChevronRight, FileText, KeyRound, LogOut, Mail, Shield, Sparkles } from 'lucide-vue-next'

const router = useRouter()
const mailStore = useMailStore()

const sections = computed(() => extractApiDocSections(apiDocMarkdown))
const renderedHtml = computed(() => renderApiDocHtml(apiDocMarkdown))
const endpointCount = computed(() => sections.value.filter((section) => section.level === 3).length)

function goHome() {
  router.push('/')
}

function logout() {
  mailStore.clearSession()
  mailStore.setMails([])
  sessionStorage.removeItem('auth')
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-40 border-b border-white/5 bg-dark-950/90 backdrop-blur-xl">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Mail class="w-4 h-4 text-white" />
          </div>
          <span class="font-bold text-gradient truncate">DriftMail</span>
          <span class="badge-primary hidden md:inline-flex">API 文档</span>
        </div>

        <div class="flex items-center gap-2">
          <button @click="goHome" class="btn-ghost btn-sm">
            <ChevronRight class="w-4 h-4 rotate-180" />
            <span class="hidden sm:inline">返回邮箱</span>
          </button>
          <button @click="logout" class="btn-ghost btn-icon btn-sm">
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
      <section class="card p-6 md:p-8 mb-6 relative overflow-hidden">
        <div class="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/60 to-transparent" />

        <div class="grid lg:grid-cols-[minmax(0,1.2fr)_320px] gap-6 lg:gap-8 items-start">
          <div class="relative z-10">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-xs uppercase tracking-[0.24em] mb-5">
              <BookText class="w-3.5 h-3.5" />
              API Reference
            </div>
            <h1 class="text-3xl sm:text-4xl font-bold text-dark-50 leading-tight mb-4">
              站内 API 文档说明
            </h1>
            <p class="text-dark-300 leading-7 max-w-2xl">
              这里直接读取仓库内的 <code class="api-doc-inline-code">API.md</code> 内容，除了接口定义，还补充了
              <code class="api-doc-inline-code">Base URL</code>、<code class="api-doc-inline-code">ACCESS_KEY</code> 和
              <code class="api-doc-inline-code">Bearer Token</code> 的项目接入示例。
            </p>

            <div class="flex flex-wrap gap-3 mt-6">
              <div class="api-doc-stat">
                <FileText class="w-4 h-4 text-primary-300" />
                <div>
                  <div class="api-doc-stat-label">接口条目</div>
                  <div class="api-doc-stat-value">{{ endpointCount }}</div>
                </div>
              </div>
              <div class="api-doc-stat">
                <Shield class="w-4 h-4 text-emerald-300" />
                <div>
                  <div class="api-doc-stat-label">访问控制</div>
                  <div class="api-doc-stat-value">Access Key / Bearer</div>
                </div>
              </div>
              <div class="api-doc-stat">
                <KeyRound class="w-4 h-4 text-amber-300" />
                <div>
                  <div class="api-doc-stat-label">文档来源</div>
                  <div class="api-doc-stat-value">仓库 API.md</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card bg-dark-900/55 p-5 relative z-10">
            <div class="flex items-center gap-2 text-dark-100 font-medium mb-4">
              <Sparkles class="w-4 h-4 text-primary-300" />
              快速接入
            </div>
            <ul class="space-y-3 text-sm text-dark-300 leading-6">
              <li>在你的项目后端填写 <code class="api-doc-inline-code">Base URL</code> 和 <code class="api-doc-inline-code">ACCESS_KEY</code>，即可调用创建邮箱接口。</li>
              <li>调用 <code class="api-doc-inline-code">/api/generate</code> 或 <code class="api-doc-inline-code">/api/custom</code> 后，每个邮箱都会返回自己的 <code class="api-doc-inline-code">token</code>。</li>
              <li>后续读取邮件列表、邮件正文和附件时，使用 <code class="api-doc-inline-code">Authorization: Bearer &lt;token&gt;</code> 即可。</li>
            </ul>

            <div class="mt-5 grid gap-3">
              <a href="#项目接入示例" class="btn-primary btn-sm w-full">
                <FileText class="w-4 h-4" />
                <span>查看接入示例</span>
              </a>
              <a href="#post-api-generate" class="btn-ghost btn-sm w-full">
                <KeyRound class="w-4 h-4" />
                <span>跳到创建邮箱</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="grid md:grid-cols-3 gap-4 mb-6">
        <div class="card p-5 relative overflow-hidden">
          <div class="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
          <div class="text-[11px] uppercase tracking-[0.24em] text-sky-300/80 mb-3">Base URL</div>
          <div class="text-sm font-mono text-dark-50 break-all">https://your-domain.workers.dev</div>
          <p class="mt-3 text-sm leading-6 text-dark-400">
            Worker 的基础入口。你的项目只需保存这个地址，所有 API 都在这个地址下面。
          </p>
        </div>

        <div class="card p-5 relative overflow-hidden">
          <div class="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
          <div class="text-[11px] uppercase tracking-[0.24em] text-amber-300/80 mb-3">ACCESS_KEY</div>
          <div class="text-sm font-mono text-dark-50 break-all">X-Access-Key: your-access-key</div>
          <p class="mt-3 text-sm leading-6 text-dark-400">
            用于创建临时邮箱的主控密钥。建议只保存在你自己的服务端环境变量里，不要直接暴露给前端。
          </p>
        </div>

        <div class="card p-5 relative overflow-hidden">
          <div class="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
          <div class="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80 mb-3">Mailbox Token</div>
          <div class="text-sm font-mono text-dark-50 break-all">Authorization: Bearer &lt;token&gt;</div>
          <p class="mt-3 text-sm leading-6 text-dark-400">
            每个新创建的邮箱都会返回自己的 token。用它获取该邮箱的收件列表、邮件正文和附件。
          </p>
        </div>
      </section>

      <section class="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
        <aside class="card p-4 lg:sticky lg:top-20">
          <div class="flex items-center gap-2 text-sm font-medium text-dark-100 mb-4">
            <BookText class="w-4 h-4 text-primary-300" />
            文档目录
          </div>
          <nav class="space-y-1.5">
            <a
              v-for="section in sections"
              :key="section.id"
              :href="`#${section.id}`"
              class="api-doc-nav-link"
              :class="section.level === 3 ? 'api-doc-nav-link-sub' : ''"
            >
              {{ section.text }}
            </a>
          </nav>
        </aside>

        <article class="card p-5 sm:p-8 md:p-10 api-doc-content" v-html="renderedHtml" />
      </section>
    </main>
  </div>
</template>
