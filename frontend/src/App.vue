<template>
  <el-container class="app-shell">
    <el-header class="topbar">
      <div class="brand">
        <div class="brand-mark"><DataAnalysis /></div>
        <div><strong>TradingAgents</strong><span>投研任务控制台</span></div>
      </div>
      <div class="service-state" :class="healthState">
        <span class="state-dot" />{{ healthText }}
      </div>
    </el-header>

    <el-main class="workspace">
      <section class="page-heading">
        <div>
          <p class="eyebrow">ANALYSIS OPERATIONS</p>
          <h1>研究任务</h1>
          <p>提交多智能体分析，跟踪执行进度并查看最终研究结论。</p>
        </div>
        <el-button :icon="Refresh" :loading="loading" @click="refreshJobs()">刷新</el-button>
      </section>

      <section class="summary-strip" aria-label="任务概览">
        <div>
          <span>任务总数</span><strong>{{ jobs.length }}</strong>
        </div>
        <div>
          <span>执行中</span><strong class="text-blue">{{ activeCount }}</strong>
        </div>
        <div>
          <span>已完成</span><strong class="text-green">{{ succeededCount }}</strong>
        </div>
        <div>
          <span>累计成本</span><strong>${{ totalCost.toFixed(4) }}</strong>
        </div>
      </section>

      <div class="content-grid">
        <aside class="create-panel">
          <div class="panel-title">
            <Plus />
            <div>
              <h2>新建分析</h2>
              <p>任务将在后台异步执行</p>
            </div>
          </div>
          <el-form label-position="top" @submit.prevent="submitAnalysis">
            <el-form-item label="标的代码"
              ><el-input
                v-model="form.ticker"
                placeholder="例如 NVDA 或 BTC-USD"
                maxlength="32"
                clearable
            /></el-form-item>
            <div class="form-row">
              <el-form-item label="分析日期"
                ><el-date-picker
                  v-model="form.trade_date"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :clearable="false"
              /></el-form-item>
              <el-form-item label="资产类型"
                ><el-segmented v-model="form.asset_type" :options="assetOptions"
              /></el-form-item>
            </div>
            <el-form-item label="分析团队">
              <el-checkbox-group v-model="form.analysts" class="analyst-grid">
                <el-checkbox-button
                  v-for="item in analystOptions"
                  :key="item.value"
                  :value="item.value"
                  >{{ item.label }}</el-checkbox-button
                >
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="报告语言">
              <el-select v-model="form.output_language"
                ><el-option label="简体中文" value="Simplified Chinese" /><el-option
                  label="English"
                  value="English"
              /></el-select>
            </el-form-item>
            <el-button
              class="submit-button"
              type="primary"
              native-type="submit"
              :icon="Plus"
              :loading="submitting"
              >创建分析任务</el-button
            >
          </el-form>
        </aside>

        <section class="jobs-panel">
          <div class="jobs-toolbar">
            <div class="panel-title compact">
              <Clock />
              <div>
                <h2>任务队列</h2>
                <p>自动刷新执行中的任务</p>
              </div>
            </div>
            <div class="filters">
              <el-input
                v-model="tickerFilter"
                placeholder="搜索代码"
                :prefix-icon="Search"
                clearable
                @keyup.enter="refreshJobs()"
              />
              <el-select
                v-model="statusFilter"
                placeholder="全部状态"
                clearable
                @change="refreshJobs()"
              >
                <el-option
                  v-for="item in statusOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-button :icon="Search" circle title="筛选" @click="refreshJobs()" />
            </div>
          </div>

          <el-table
            v-loading="loading"
            :data="jobs"
            class="jobs-table"
            row-key="id"
            empty-text="暂无分析任务"
            @row-click="openDetail"
          >
            <el-table-column label="标的" min-width="115"
              ><template #default="{ row }"
                ><div class="ticker-cell">
                  <strong>{{ row.ticker }}</strong
                  ><span>{{ assetLabel(row.asset_type) }}</span>
                </div></template
              ></el-table-column
            >
            <el-table-column prop="trade_date" label="分析日期" min-width="112" />
            <el-table-column label="状态" min-width="112"
              ><template #default="{ row }"
                ><el-tag :type="statusTag(row.status)" effect="light" round>{{
                  statusLabel(row.status)
                }}</el-tag></template
              ></el-table-column
            >
            <el-table-column label="进度" min-width="190"
              ><template #default="{ row }"
                ><div class="progress-cell">
                  <el-progress
                    :percentage="row.progress_percent"
                    :stroke-width="6"
                    :show-text="false"
                  /><span>{{ row.progress_percent }}%</span>
                </div>
                <small>{{ row.current_step || '等待开始' }}</small></template
              ></el-table-column
            >
            <el-table-column label="成本" min-width="95" align="right"
              ><template #default="{ row }"
                >${{ Number(row.cost_usd || 0).toFixed(4) }}</template
              ></el-table-column
            >
            <el-table-column label="创建时间" min-width="150"
              ><template #default="{ row }">{{
                formatDateTime(row.created_at)
              }}</template></el-table-column
            >
            <el-table-column width="52" align="right"
              ><template #default
                ><el-icon><ArrowRight /></el-icon></template
            ></el-table-column>
          </el-table>
        </section>
      </div>
    </el-main>

    <el-drawer v-model="drawerVisible" :size="drawerSize" destroy-on-close class="detail-drawer">
      <template #header
        ><div class="drawer-heading">
          <span>分析详情</span><strong>{{ detail?.stock_symbol || selectedJob?.ticker }}</strong>
        </div></template
      >
      <div v-loading="detailLoading" class="detail-content">
        <template v-if="detail">
          <section class="detail-status">
            <div>
              <span>状态</span
              ><el-tag :type="statusTag(detail.status)" round>{{
                detail.status_label || statusLabel(detail.status)
              }}</el-tag>
            </div>
            <div>
              <span>分析日期</span><strong>{{ detail.analysis_date || '-' }}</strong>
            </div>
            <div>
              <span>Token</span><strong>{{ detail.tokens_used.toLocaleString() }}</strong>
            </div>
            <div>
              <span>成本</span><strong>${{ Number(detail.cost_usd || 0).toFixed(4) }}</strong>
            </div>
          </section>
          <el-alert
            v-if="detail.error"
            :title="detail.error"
            type="error"
            :closable="false"
            show-icon
          />
          <section
            v-if="detail.status === 'queued' || detail.status === 'running'"
            class="progress-detail"
          >
            <div>
              <strong>{{ detail.current_step || '等待开始' }}</strong
              ><span>{{ detail.progress_percent }}%</span>
            </div>
            <el-progress :percentage="detail.progress_percent" :stroke-width="10" />
          </section>
          <section v-if="detail.status === 'succeeded'" class="decision-panel">
            <p>最终结论</p>
            <div class="decision-head">
              <strong>{{ detail.decision.action || 'Hold' }}</strong
              ><span v-if="detail.decision.confidence"
                >置信度 {{ percent(detail.decision.confidence) }}</span
              >
            </div>
            <p class="decision-copy">
              {{ detail.summary || detail.decision.reasoning || '分析已完成。' }}
            </p>
            <div class="decision-meta">
              <span v-if="detail.decision.target_price != null"
                >目标价 <b>{{ detail.decision.target_price }}</b></span
              ><span
                >风险评分 <b>{{ percent(detail.decision.risk_score || 0) }}</b></span
              >
            </div>
          </section>
          <el-tabs v-model="detailTab" class="detail-tabs">
            <el-tab-pane label="研究报告" name="reports">
              <el-collapse v-if="reportEntries.length" accordion>
                <el-collapse-item
                  v-for="([key, value], index) in reportEntries"
                  :key="key"
                  :name="index"
                >
                  <template #title
                    ><Document /><span>{{ reportLabel(key) }}</span></template
                  >
                  <article class="report-text">{{ value }}</article>
                </el-collapse-item>
              </el-collapse>
              <el-empty v-else description="报告尚未生成" :image-size="80" />
            </el-tab-pane>
            <el-tab-pane label="执行事件" name="events">
              <el-timeline v-if="detail.events.length">
                <el-timeline-item
                  v-for="(event, index) in [...detail.events].reverse()"
                  :key="index"
                  :timestamp="formatDateTime(event.timestamp || event.time)"
                  placement="top"
                >
                  <strong>{{ event.message || event.step || '状态更新' }}</strong>
                  <p v-if="event.progress != null || event.progress_percent != null">
                    进度 {{ event.progress ?? event.progress_percent }}%
                  </p>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无执行事件" :image-size="80" />
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
    </el-drawer>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Clock,
  DataAnalysis,
  Document,
  Plus,
  Refresh,
  Search
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import {
  checkHealth,
  createAnalysis,
  getAnalysis,
  listAnalyses,
  type AnalysisDetail,
  type AnalysisJob,
  type AnalystKey,
  type AssetType,
  type JobStatus
} from './api/jobs'

const jobs = ref<AnalysisJob[]>([])
const loading = ref(false)
const submitting = ref(false)
const healthState = ref<'checking' | 'online' | 'offline'>('checking')
const tickerFilter = ref('')
const statusFilter = ref<JobStatus | ''>('')
const drawerVisible = ref(false)
const detailLoading = ref(false)
const selectedJob = ref<AnalysisJob | null>(null)
const detail = ref<AnalysisDetail | null>(null)
const detailTab = ref('reports')
const viewportWidth = ref(window.innerWidth)
let pollTimer: ReturnType<typeof setInterval> | undefined

const form = reactive({
  ticker: '',
  trade_date: dayjs().format('YYYY-MM-DD'),
  asset_type: 'stock' as AssetType,
  analysts: ['market', 'social', 'news', 'fundamentals'] as AnalystKey[],
  output_language: 'Simplified Chinese'
})
const assetOptions = [
  { label: '股票', value: 'stock' },
  { label: '加密', value: 'crypto' }
]
const analystOptions: Array<{ label: string; value: AnalystKey }> = [
  { label: '市场', value: 'market' },
  { label: '情绪', value: 'social' },
  { label: '新闻', value: 'news' },
  { label: '基本面', value: 'fundamentals' }
]
const statusOptions: Array<{ label: string; value: JobStatus }> = [
  { label: '排队中', value: 'queued' },
  { label: '执行中', value: 'running' },
  { label: '已完成', value: 'succeeded' },
  { label: '失败', value: 'failed' }
]

const healthText = computed(
  () =>
    ({ checking: '服务检查中', online: 'API 服务正常', offline: 'API 服务异常' })[healthState.value]
)
const activeCount = computed(
  () => jobs.value.filter(job => ['queued', 'running'].includes(job.status)).length
)
const succeededCount = computed(() => jobs.value.filter(job => job.status === 'succeeded').length)
const totalCost = computed(() =>
  jobs.value.reduce((total, job) => total + Number(job.cost_usd || 0), 0)
)
const drawerSize = computed(() => (viewportWidth.value < 760 ? '100%' : 'min(720px, 78vw)'))
const reportEntries = computed(() =>
  Object.entries(detail.value?.reports || {}).filter(([, value]) => Boolean(value))
)

async function refreshJobs(silent = false) {
  if (!silent) loading.value = true
  try {
    jobs.value = await listAnalyses({
      status: statusFilter.value || undefined,
      ticker: tickerFilter.value.trim().toUpperCase() || undefined,
      limit: 100
    })
    healthState.value = 'online'
  } catch (error) {
    healthState.value = 'offline'
    if (!silent) ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function submitAnalysis() {
  const ticker = form.ticker.trim().toUpperCase()
  if (!ticker) {
    ElMessage.warning('请输入标的代码')
    return
  }
  if (!form.analysts.length) {
    ElMessage.warning('请至少选择一名分析师')
    return
  }
  submitting.value = true
  try {
    const job = await createAnalysis({ ...form, ticker })
    form.ticker = ''
    jobs.value = [job, ...jobs.value.filter(item => item.id !== job.id)]
    ElMessage.success(`${job.ticker} 分析任务已创建`)
    await openDetail(job)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function openDetail(job: AnalysisJob) {
  selectedJob.value = job
  drawerVisible.value = true
  detailLoading.value = true
  detailTab.value = 'reports'
  try {
    detail.value = await getAnalysis(job.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function refreshOpenDetail() {
  if (!drawerVisible.value || !selectedJob.value) return
  try {
    detail.value = await getAnalysis(selectedJob.value.id)
  } catch {
    /* The list refresh reports connectivity. */
  }
}

function statusLabel(status: JobStatus) {
  return { queued: '排队中', running: '执行中', succeeded: '已完成', failed: '失败' }[status]
}
function statusTag(status: JobStatus) {
  return ({ queued: 'info', running: 'primary', succeeded: 'success', failed: 'danger' } as const)[
    status
  ]
}
function assetLabel(asset: AssetType) {
  return asset === 'crypto' ? '加密资产' : '股票'
}
function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}
function percent(value: number) {
  return `${Math.round(value <= 1 ? value * 100 : value)}%`
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}
function reportLabel(key: string) {
  return (
    (
      {
        market_report: '市场分析',
        sentiment_report: '市场情绪',
        news_report: '新闻分析',
        fundamentals_report: '基本面分析',
        research_team_decision: '研究团队结论',
        trader_investment_plan: '投资计划',
        final_trade_decision: '最终决策',
        risk_management_decision: '风险管理',
        risky_analyst: '进取观点',
        safe_analyst: '保守观点',
        neutral_analyst: '中性观点',
        bull_researcher: '多方研究',
        bear_researcher: '空方研究'
      } as Record<string, string>
    )[key] || key.replace(/_/g, ' ')
  )
}
function updateViewport() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  window.addEventListener('resize', updateViewport)
  try {
    const health = await checkHealth()
    healthState.value = health.status === 'ok' ? 'online' : 'offline'
  } catch {
    healthState.value = 'offline'
  }
  await refreshJobs()
  pollTimer = setInterval(async () => {
    await refreshJobs(true)
    await refreshOpenDetail()
  }, 5000)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  if (pollTimer) clearInterval(pollTimer)
})
</script>
