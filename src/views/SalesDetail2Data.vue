<script setup>
/**
 * 销售详情2（数据中台）—— 预计算版（查 dw.rpt_sale_detail_precompute，秒级）
 *
 * 展示逻辑 100% 移植自 3001 SalesDetail2.vue（单页 15 列 + 当日库存金额，按机构编码聚合，
 * 按前四位分组（1101/1102/1103/1104…）+ 组尾「合计」行），数据改为查预计算表（reportType=SALE_DETAIL_2）。
 *
 * 取数：触发两次预计算表查询（comparisonType=MOM / YOY），复用 3001 的 storeRows 聚合 +
 * buildSubtotal 合计逻辑，与 3001 引擎直查对账零差异。
 * 管理面板：手动触发回补（reportType=SALE_DETAIL_2，机构编码可编辑，默认 1101,1102,1191001）、
 * 最近跑批记录（按 reportType 过滤）。
 */
import { ref, computed, onMounted } from 'vue'
import request from '../utils/request'

const REPORT_TYPE = 'SALE_DETAIL_2'

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 业务日期默认 = 昨天（与预计算定时任务一致）
function defaultQueryForm() {
  const now = new Date()
  const prev = new Date(now); prev.setDate(now.getDate() - 1)
  return {
    queryDate: fmtDate(prev),
    orgCode: '1101,1102,1191001'  // 默认机构（1101 巨野组 / 1102 便利组 / 1191001），可改子集如 1101,1102
  }
}

const queryForm = ref(defaultQueryForm())

// ========== Union 特殊逻辑 ==========
// 勾选后查询接口带 unionStockCodes，UNION ALL 追加这些「仅库存」门店（预计算表未返回的补行，
// 仅机构编码/机构名称/当日库存金额三列，其余按 0；已返回的跳过防翻倍）。
// 编码须与后端 application.yml 的 secondary.screenshots.sd2.union-stock-codes 保持一致。
const UNION_STOCK_CODES = '1104901,1103801'
const unionEnabled = ref(false)

// ========== API 数据 ==========
const apiLoading = ref(false)
const apiError = ref('')
const momData = ref(null)   // 环比调用结果（comparisonType=MOM，本期 + 环比对期）
const yoyData = ref(null)   // 同比调用结果（comparisonType=YOY，本期 + 同比对期）

async function fetchData() {
  apiLoading.value = true
  apiError.value = ''
  try {
    const base = {
      queryDate: queryForm.value.queryDate,
      orgCode: queryForm.value.orgCode,
      reportType: REPORT_TYPE,
      ...(unionEnabled.value ? { unionStockCodes: UNION_STOCK_CODES } : {})
    }
    const [momRes, yoyRes] = await Promise.all([
      request.get('/provider/sales/precompute', { ...base, comparisonType: 'MOM' }),
      request.get('/provider/sales/precompute', { ...base, comparisonType: 'YOY' })
    ])
    momData.value = momRes
    yoyData.value = yoyRes
  } catch (e) {
    apiError.value = '数据加载失败: ' + (e.message || '未知错误')
    momData.value = null
    yoyData.value = null
  } finally {
    apiLoading.value = false
  }
}

function resetForm() {
  queryForm.value = defaultQueryForm()
  momData.value = null
  yoyData.value = null
  apiError.value = ''
}

onMounted(fetchData)

// ========== 数值辅助（与 3001 SalesDetail2.vue 一致） ==========
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
// 客单价 = 销售额 / 来客数
function avgPriceOf(sales, customers) {
  const s = num(sales)
  const c = num(customers)
  if (s === null || c === null || c === 0) return null
  return Number((s / c).toFixed(2))
}
// 毛利率 = 毛利额 / 销售额
function profitRateOf(profit, sales) {
  const p = num(profit)
  const s = num(sales)
  if (p === null || s === null || s === 0) return null
  return Number(((p / s) * 100).toFixed(2))
}
// 增长率 = (本期 - 对期) / 对期；对期为 0/空 → 空白
function rate(cur, prior) {
  const c = num(cur)
  const p = num(prior)
  if (c === null || p === null || p === 0) return null
  return Number(((c - p) / p * 100).toFixed(2))
}

// ========== 机构分组：按机构编码前四位归类（1101/1102/1103/1104…，前四位相同即同组） ==========
// 组顺序 = 前四位升序；每组组尾出合计行，合计行统一只叫「合计」（不带组名前缀）。与 SalesDetail2.vue 同源
function getGroup(code) {
  const s = String(code || '')
  return s.length >= 4 ? s.slice(0, 4) : (s || '其他')
}

// ========== 构建各店数据（按机构编码分组汇总） ==========
const storeRows = computed(() => {
  const mom = momData.value
  if (!mom || !mom.length) return []
  const yoy = yoyData.value || []

  // 同一机构可能返回多行（部门级明细），按机构编码求和得到「各店」数据
  // 本期值 + 环比对期值 从 MOM 查询取；同比对期值 从 YOY 查询取
  const map = new Map()
  const getItem = (code) => {
    const key = String(code)
    if (!map.has(key)) {
      map.set(key, {
        orgCode: code,
        orgName: '',
        sales: 0, profit: 0, customers: 0, stockAmount: 0, // 本期（含当日库存金额）
        momSales: 0, momProfit: 0, momCustomers: 0,        // 环比对期
        yoySales: 0, yoyProfit: 0, yoyCustomers: 0,        // 同比对期
        hasData: false,
        hasStock: false                                     // 库存是否已赋值（防 MOM/YOY 重复累加翻倍）
      })
    }
    return map.get(key)
  }

  for (const r of mom) {
    const code = r['机构编码']
    if (code === null || code === undefined || code === '') continue
    const it = getItem(code)
    if (!it.orgName) it.orgName = r['机构名称'] || ''
    it.sales += num(r['销售金额']) || 0
    it.profit += num(r['含税毛利']) || 0
    it.customers += num(r['交易笔数']) || 0
    it.stockAmount += num(r['当日库存金额']) || 0
    it.hasStock = true
    it.momSales += num(r['对期销售金额']) || 0
    it.momProfit += num(r['对期含税毛利']) || 0
    it.momCustomers += num(r['对期交易笔数']) || 0
    it.hasData = true
  }
  for (const r of yoy) {
    const code = r['机构编码']
    if (code === null || code === undefined || code === '') continue
    let it = map.get(String(code))
    if (!it) it = getItem(code)
    if (!it.orgName) it.orgName = r['机构名称'] || ''
    it.yoySales += num(r['对期销售金额']) || 0
    it.yoyProfit += num(r['对期含税毛利']) || 0
    it.yoyCustomers += num(r['对期交易笔数']) || 0
    // 当日库存金额 = 本期当天实时库存快照（与 cmp 无关）：仅当 MOM 未返回该店时用 YOY 返回的库存补上，
    // 已有库存则跳过，避免两个查询同一库存重复累加翻倍（与后端 SalesDetail2ReportService 同源）
    if (!it.hasStock) {
      it.stockAmount += num(r['当日库存金额']) || 0
      it.hasStock = true
    }
  }

  // 派生指标（公式计算）
  const rows = []
  for (const it of map.values()) {
    // 全 0 门店也占位显示：所有门店都保留在 rows 中参与合计与百分比计算；
    // 当日库存金额为 0 的门店仅在渲染层用 v-show 隐藏（不展示但参与计算，与后端截图服务同源）
    const avgPrice = avgPriceOf(it.sales, it.customers)
    const yoyAvgPrice = avgPriceOf(it.yoySales, it.yoyCustomers)
    const momAvgPrice = avgPriceOf(it.momSales, it.momCustomers)
    rows.push({
      ...it,
      group: getGroup(it.orgCode),
      avgPrice,
      yoyAvgPrice,
      momAvgPrice,
      profitRate: profitRateOf(it.profit, it.sales),
      yoySalesRate: rate(it.sales, it.yoySales),
      momSalesRate: rate(it.sales, it.momSales),
      yoyProfitRate: rate(it.profit, it.yoyProfit),
      momProfitRate: rate(it.profit, it.momProfit),
      yoyCustomerRate: rate(it.customers, it.yoyCustomers),
      momCustomerRate: rate(it.customers, it.momCustomers),
      yoyAvgPriceRate: rate(avgPrice, yoyAvgPrice),
      momAvgPriceRate: rate(avgPrice, momAvgPrice)
    })
  }
  // 按机构编码升序（前四位相同即同组，升序后同组自然连续）
  rows.sort((a, b) => String(a.orgCode).localeCompare(String(b.orgCode)))
  return rows
})

// ========== 合计行（Excel 合计逻辑：金额求和，派生指标按合计值公式） ==========
// 合计行统一只叫「合计」（不带组名前缀，与 SalesDetail2.vue 同源）
function buildSubtotal(rows) {
  // 巨野便利店配送中心(1102911)为配送中心，不当门店，整行不进门店合计
  const calc = rows.filter(r => String(r.orgCode) !== '1102911')
  const sales = calc.reduce((s, r) => s + (num(r.sales) || 0), 0)
  const profit = calc.reduce((s, r) => s + (num(r.profit) || 0), 0)
  const customers = calc.reduce((s, r) => s + (num(r.customers) || 0), 0)
  const stockAmount = calc.reduce((s, r) => s + (num(r.stockAmount) || 0), 0)
  const yoySales = calc.reduce((s, r) => s + (num(r.yoySales) || 0), 0)
  const yoyProfit = calc.reduce((s, r) => s + (num(r.yoyProfit) || 0), 0)
  const yoyCustomers = calc.reduce((s, r) => s + (num(r.yoyCustomers) || 0), 0)
  const momSales = calc.reduce((s, r) => s + (num(r.momSales) || 0), 0)
  const momProfit = calc.reduce((s, r) => s + (num(r.momProfit) || 0), 0)
  const momCustomers = calc.reduce((s, r) => s + (num(r.momCustomers) || 0), 0)
  const avgPrice = avgPriceOf(sales, customers)
  const yoyAvgPrice = avgPriceOf(yoySales, yoyCustomers)
  const momAvgPrice = avgPriceOf(momSales, momCustomers)
  return {
    isSubtotal: true,
    orgCode: '',
    orgName: '合计',
    sales, profit, customers, stockAmount, avgPrice,
    profitRate: profitRateOf(profit, sales),
    yoySalesRate: rate(sales, yoySales),
    momSalesRate: rate(sales, momSales),
    yoyProfitRate: rate(profit, yoyProfit),
    momProfitRate: rate(profit, momProfit),
    yoyCustomerRate: rate(customers, yoyCustomers),
    momCustomerRate: rate(customers, momCustomers),
    yoyAvgPriceRate: rate(avgPrice, yoyAvgPrice),
    momAvgPriceRate: rate(avgPrice, momAvgPrice)
  }
}

// ========== 表格数据：按组（前四位）分段 + 组尾合计行 ==========
const tableData = computed(() => {
  const rows = storeRows.value
  if (!rows.length) return []
  const result = []
  // 组 = 出现过的前四位，升序排列（如 1101、1102、1103、1104、1191…）
  const groups = [...new Set(rows.map(r => r.group))].sort()
  for (const g of groups) {
    const grp = rows.filter(r => r.group === g)
    if (grp.length) {
      result.push(...grp)
      result.push(buildSubtotal(grp))
    }
  }
  return result
})

const loadedCount = computed(() => storeRows.value.length)

// ========== 格式化 ==========
function formatAmount(n) {
  if (n === undefined || n === null) return ''
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatInt(n) {
  if (n === undefined || n === null) return ''
  return Number(n).toLocaleString('zh-CN')
}
function formatRate(v) {
  if (v === undefined || v === null) return ''
  const prefix = v > 0 ? '+' : ''
  return prefix + Number(v).toFixed(2) + '%'
}
function formatPct(v) {
  if (v === undefined || v === null) return ''
  return Number(v).toFixed(2) + '%'
}
function getRateClass(v) {
  if (v === undefined || v === null) return ''
  if (v > 0) return 'rate-up'
  if (v < 0) return 'rate-down'
  return ''
}
// 时间戳显示（etl_time 是 ISO 字符串，截取到秒）
function fmtTime(v) {
  if (!v) return ''
  return String(v).replace('T', ' ').substring(0, 19)
}

// ========== 导出 Excel (CSV) ==========
function exportExcel() {
  const headers = [
    '机构代码', '机构名称', '当日库存金额', '销售额/元', '同比销售额增长率', '环比销售额增长率',
    '毛利额/元', '同比毛利额增长率', '环比毛利额增长率', '毛利率',
    '来客数', '同比来客数增长率', '环比来客数增长率',
    '客单价/元', '同比客单价增长率', '环比客单价增长率'
  ]
  let csv = '\uFEFF' + headers.join(',') + '\n'
  for (const row of tableData.value) {
    const values = [
      row.orgCode, row.orgName, row.stockAmount, row.sales,
      formatRate(row.yoySalesRate), formatRate(row.momSalesRate),
      row.profit, formatRate(row.yoyProfitRate), formatRate(row.momProfitRate),
      formatPct(row.profitRate),
      row.customers, formatRate(row.yoyCustomerRate), formatRate(row.momCustomerRate),
      row.avgPrice, formatRate(row.yoyAvgPriceRate), formatRate(row.momAvgPriceRate)
    ]
    csv += values.map(v => {
      const s = String(v || '')
      if (s.includes(',') || s.includes('\n') || s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }).join(',') + '\n'
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '销售详情2_数据中台_' + (queryForm.value.queryDate || '') + '.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

// ========== 预计算管理（手动触发回补 + 最近跑批记录） ==========
const triggerForm = ref({ date: defaultQueryForm().queryDate, orgCodes: '1101,1102,1191001' })
const triggering = ref(false)
const triggerMsg = ref('')
const batchLogs = ref([])

async function loadLogs() {
  try {
    batchLogs.value = await request.get('/provider/sales/precompute/logs', { limit: 20, reportType: REPORT_TYPE })
  } catch (e) {
    console.error('加载跑批记录失败:', e)
  }
}

async function triggerPrecompute() {
  if (!triggerForm.value.date) {
    triggerMsg.value = '请先选择业务日期'
    return
  }
  const orgs = (triggerForm.value.orgCodes || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!orgs.length) {
    triggerMsg.value = '请填写机构编码（多个用英文逗号分隔）'
    return
  }
  triggering.value = true
  triggerMsg.value = `报表2 跑批中（多机构整串一次引擎调用 MOM+YOY，约 30-60 秒），请稍候...`
  try {
    // orgCode 支持多个，英文逗号分隔；报表2 一次引擎调用全返回（行自带机构编码）
    const r = await request.post('/provider/sales/precompute/trigger?queryDate=' + triggerForm.value.date +
      '&orgCode=' + encodeURIComponent(orgs.join(',')) + '&reportType=' + REPORT_TYPE, {})
    triggerMsg.value = r.message || (r.code === 0 ? '跑批完成' : '跑批失败')
    if (r.code === 0) {
      // 跑批完成后自动刷新表格与日志；查询机构自动切为本次跑批的机构串
      queryForm.value.queryDate = triggerForm.value.date
      queryForm.value.orgCode = orgs.join(',')
      await fetchData()
      await loadLogs()
    }
  } catch (e) {
    triggerMsg.value = '触发失败: ' + (e.message || '未知错误')
  } finally {
    triggering.value = false
  }
}

// 页面进入时自动加载一次 + 加载最近跑批记录
onMounted(() => {
  // fetchData 已在上方 onMounted 注册；这里仅补充加载日志
  loadLogs()
})
</script>

<template>
  <div class="sales-detail-page">
    <!-- 标题区域 -->
    <div class="page-header">
      <h2>销售详情2（数据中台）</h2>
      <div class="date-info">
        <span class="tag current">业务日期：{{ queryForm.queryDate }}</span>
        <span v-if="momData" class="tag loaded">已加载 {{ loadedCount }} 家门店（查预计算表）</span>
        <span class="tag note">凌晨 2:00 自动跑批，数据来自 dw.rpt_sale_detail_precompute</span>
      </div>
    </div>

    <!-- 预计算管理面板 -->
    <div class="manage-panel">
      <h3>⚡ 预计算管理（报表2 · dw.rpt_sale_detail_precompute）</h3>
      <div class="manage-row">
        <div class="query-item">
          <label>业务日期:</label>
          <input type="date" v-model="triggerForm.date" />
        </div>
        <div class="query-item">
          <label>机构编码:</label>
          <input type="text" v-model="triggerForm.orgCodes" placeholder="多个用逗号分隔，如 1101,1102" style="width:230px" />
        </div>
        <button class="btn-trigger" @click="triggerPrecompute" :disabled="triggering">
          {{ triggering ? '跑批中...' : '▶ 手动触发回补' }}
        </button>
        <span class="trigger-msg" :class="{ 'msg-err': triggerMsg && triggerMsg.indexOf('失败') >= 0 }">{{ triggerMsg }}</span>
        <span class="trigger-hint">机构编码可改子集（如 1101,1102）；仅传子集则只同步/查询该子集；输入历史日期可重算覆盖（幂等）</span>
      </div>
      <div class="log-table-wrap" v-if="batchLogs.length">
        <table class="log-table">
          <thead>
            <tr>
              <th>query_date</th>
              <th>机构</th>
              <th>comparison</th>
              <th>batch_id</th>
              <th>etl_time</th>
              <th>行数</th>
              <th>status</th>
              <th>trigger</th>
              <th>message</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(lg, i) in batchLogs" :key="i">
              <td>{{ lg.query_date }}</td>
              <td>{{ lg.org_code }}</td>
              <td>{{ lg.comparison_type }}</td>
              <td>{{ lg.batch_id }}</td>
              <td>{{ fmtTime(lg.etl_time) }}</td>
              <td>{{ lg.row_count }}</td>
              <td :class="lg.status === 'SUCCESS' ? 'st-ok' : 'st-err'">{{ lg.status }}</td>
              <td>{{ lg.trigger_type }}</td>
              <td class="lg-msg">{{ lg.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="log-empty">暂无报表2 跑批记录（每天凌晨 2:00 定时任务将自动生成；也可手动触发）</div>
    </div>

    <!-- 查询区域 -->
    <div class="query-panel">
      <div class="query-row">
        <div class="query-item">
          <label>业务日期:</label>
          <input type="date" v-model="queryForm.queryDate" />
        </div>
        <div class="query-item">
          <label>机构编码:</label>
          <input type="text" v-model="queryForm.orgCode" placeholder="如 1101,1102,1191001" style="width:200px" />
        </div>
        <div class="query-item query-union" title="勾选后查询结果 UNION ALL 追加仅库存门店（1104901/1103801），预计算表未返回的补行，其余指标按 0">
          <label class="union-label" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" v-model="unionEnabled" style="margin:0;cursor:pointer;" />
            <span style="white-space:nowrap;">Union特殊逻辑</span>
          </label>
        </div>
        <div class="query-actions">
          <button class="btn-primary" @click="fetchData" :disabled="apiLoading">
            {{ apiLoading ? '查询中...' : '查询' }}
          </button>
          <button class="btn-default" @click="resetForm">重置</button>
          <button class="btn-export" @click="exportExcel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出Excel
          </button>
        </div>
      </div>
      <div class="query-error" v-if="apiError">{{ apiError }}</div>
    </div>

    <!-- 表格：各店每月最终取值 16 列 -->
    <div class="table-wrapper">
      <table class="sales-table">
        <thead>
          <tr>
            <th class="col-code">机构代码</th>
            <th class="col-org">机构名称</th>
            <th class="col-num col-stock">当日库存金额</th>
            <th class="col-num col-sales">销售额/元</th>
            <th class="col-rate col-sales">同比<br>销售额增长率</th>
            <th class="col-rate col-sales">环比<br>销售额增长率</th>
            <th class="col-num col-profit">毛利额/元</th>
            <th class="col-rate col-profit">同比<br>毛利额增长率</th>
            <th class="col-rate col-profit">环比<br>毛利额增长率</th>
            <th class="col-num col-profit">毛利率</th>
            <th class="col-num col-customer">来客数</th>
            <th class="col-rate col-customer">同比<br>来客数增长率</th>
            <th class="col-rate col-customer">环比<br>来客数增长率</th>
            <th class="col-num col-price">客单价/元</th>
            <th class="col-rate col-price">同比<br>客单价增长率</th>
            <th class="col-rate col-price">环比<br>客单价增长率</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, idx) in tableData" :key="idx">
            <!-- 合计行 -->
            <tr v-if="row.isSubtotal" class="subtotal">
              <td class="col-code"></td>
              <td class="col-org subtotal-label">{{ row.orgName }}</td>
              <td class="col-num col-stock">{{ formatAmount(row.stockAmount) }}</td>
              <td class="col-num col-sales">{{ formatAmount(row.sales) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.yoySalesRate)]">{{ formatRate(row.yoySalesRate) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.momSalesRate)]">{{ formatRate(row.momSalesRate) }}</td>
              <td class="col-num col-profit">{{ formatAmount(row.profit) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.yoyProfitRate)]">{{ formatRate(row.yoyProfitRate) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.momProfitRate)]">{{ formatRate(row.momProfitRate) }}</td>
              <td class="col-num col-profit">{{ formatPct(row.profitRate) }}</td>
              <td class="col-num col-customer">{{ formatInt(row.customers) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.yoyCustomerRate)]">{{ formatRate(row.yoyCustomerRate) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.momCustomerRate)]">{{ formatRate(row.momCustomerRate) }}</td>
              <td class="col-num col-price">{{ formatAmount(row.avgPrice) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.yoyAvgPriceRate)]">{{ formatRate(row.yoyAvgPriceRate) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.momAvgPriceRate)]">{{ formatRate(row.momAvgPriceRate) }}</td>
            </tr>
            <!-- 各店行：库存=0 的门店隐藏（v-show，仍参与合计计算） -->
            <tr v-else v-show="row.stockAmount > 0" :class="{ 'odd': idx % 2 === 1 }">
              <td class="col-code">{{ row.orgCode }}</td>
              <td class="col-org">{{ row.orgName }}</td>
              <td class="col-num col-stock">{{ formatAmount(row.stockAmount) }}</td>
              <td class="col-num col-sales">{{ formatAmount(row.sales) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.yoySalesRate)]">{{ formatRate(row.yoySalesRate) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.momSalesRate)]">{{ formatRate(row.momSalesRate) }}</td>
              <td class="col-num col-profit">{{ formatAmount(row.profit) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.yoyProfitRate)]">{{ formatRate(row.yoyProfitRate) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.momProfitRate)]">{{ formatRate(row.momProfitRate) }}</td>
              <td class="col-num col-profit">{{ formatPct(row.profitRate) }}</td>
              <td class="col-num col-customer">{{ formatInt(row.customers) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.yoyCustomerRate)]">{{ formatRate(row.yoyCustomerRate) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.momCustomerRate)]">{{ formatRate(row.momCustomerRate) }}</td>
              <td class="col-num col-price">{{ formatAmount(row.avgPrice) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.yoyAvgPriceRate)]">{{ formatRate(row.yoyAvgPriceRate) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.momAvgPriceRate)]">{{ formatRate(row.momAvgPriceRate) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sales-detail-page {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  overflow: hidden;
  font-size: 13px;
  color: #333;
}

/* 标题 */
.page-header {
  text-align: center;
  padding: 20px 16px 12px;
  border-bottom: 1px solid #e8e8e8;
  background: linear-gradient(135deg, #fff8e1 0%, #fffde7 100%);
}
.page-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #b71c1c;
  margin-bottom: 10px;
  letter-spacing: 1px;
}
.date-info {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}
.tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  font-weight: 500;
}
.tag.current {
  background: #e3f2fd;
  color: #1565c0;
}
.tag.loaded {
  background: #e8f5e9;
  color: #2e7d32;
}
.tag.note {
  background: #fff3e0;
  color: #e65100;
}

/* 预计算管理面板 */
.manage-panel {
  padding: 14px 20px;
  border-bottom: 2px solid #ffb300;
  background: linear-gradient(135deg, #fffde7 0%, #fff8e1 100%);
}
.manage-panel h3 {
  font-size: 14px;
  color: #e65100;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}
.manage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.manage-row .query-item label {
  white-space: nowrap;
  color: #555;
  font-size: 13px;
}
.manage-row .query-item input[type="date"] {
  padding: 5px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: #fff;
  width: 140px;
}
.btn-trigger {
  background: #fa8c16;
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background .2s;
}
.btn-trigger:hover { background: #ffa940; }
.btn-trigger:disabled { background: #ffd591; cursor: not-allowed; }
.trigger-msg {
  font-size: 12px;
  color: #2e7d32;
}
.trigger-msg.msg-err {
  color: #d32f2f;
}
.trigger-hint {
  font-size: 11px;
  color: #999;
}
.log-table-wrap {
  margin-top: 10px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background: #fff;
}
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.log-table th {
  position: sticky;
  top: 0;
  background: #f5f5f5;
  color: #333;
  font-weight: 600;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  white-space: nowrap;
  z-index: 5;
}
.log-table td {
  padding: 5px 8px;
  border: 1px solid #f0f0f0;
  text-align: center;
  white-space: nowrap;
}
.log-table td.lg-msg {
  text-align: left;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.log-table .st-ok { color: #2e7d32; font-weight: 600; }
.log-table .st-err { color: #d32f2f; font-weight: 600; }
.log-empty {
  margin-top: 10px;
  font-size: 12px;
  color: #999;
  padding: 8px;
}

/* 查询 */
.query-panel {
  padding: 14px 20px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}
.query-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.query-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.query-item label {
  white-space: nowrap;
  color: #555;
  font-size: 13px;
}
.query-item input[type="date"],
.query-item input[type="text"] {
  padding: 5px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.query-item input[type="date"] {
  width: 140px;
}
.query-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.query-error {
  color: #d32f2f;
  font-size: 12px;
  margin-top: 6px;
}
.btn-primary {
  background: #1890ff;
  color: #fff;
  border: none;
  padding: 6px 18px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background .2s;
}
.btn-primary:hover { background: #40a9ff; }
.btn-primary:disabled { background: #91caff; cursor: not-allowed; }
.btn-default {
  background: #fff;
  color: #555;
  border: 1px solid #d9d9d9;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all .2s;
}
.btn-default:hover { border-color: #1890ff; color: #1890ff; }
.btn-export {
  background: #52c41a;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background .2s;
}
.btn-export:hover { background: #73d13d; }

/* 表格 */
.table-wrapper {
  overflow-x: auto;
  padding: 0;
}
.sales-table {
  width: 100%;
  min-width: 1800px;
  border-collapse: collapse;
  font-size: 12px;
}
.sales-table thead th {
  font-weight: 600;
  padding: 8px 6px;
  border: 2px solid #8c8c8c;
  text-align: center;
  white-space: nowrap;
  background: #f5f5f5;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}
.sales-table tbody td {
  padding: 7px 6px;
  border: 1.5px solid #bfbfbf;
  text-align: center;
}
.sales-table tbody tr:hover {
  background: #e3f2fd;
}
.sales-table tbody tr.odd {
  background: #fafafa;
}
.sales-table tbody tr.odd:hover {
  background: #e3f2fd;
}

/* 列宽 */
.col-code { min-width: 90px; }
.col-org { min-width: 200px; }
.col-num { min-width: 85px; text-align: center !important; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.col-rate { min-width: 70px; }

/* 列分组颜色 */
.col-sales { background: #fff3e0 !important; }
.col-profit { background: #e8f5e9 !important; }
.col-customer { background: #e3f2fd !important; }
.col-price { background: #fce4ec !important; }
.col-stock { background: #f3e5f5 !important; }

/* 合计行 */
.subtotal {
  background: linear-gradient(90deg, #fff59d 0%, #fff9c4 100%) !important;
  font-weight: 700;
}
.subtotal td {
  border-top: 2px solid #f57f17 !important;
  border-bottom: 2px solid #f57f17 !important;
  color: #4e342e !important;
}
.subtotal:hover {
  background: linear-gradient(90deg, #fff176 0%, #fff59d 100%) !important;
}
.subtotal-label {
  font-weight: 700;
  letter-spacing: 1px;
}

/* 增长率颜色（中国惯例：涨红跌绿） */
.rate-up {
  color: #d32f2f;
  font-weight: 500;
}
.rate-down {
  color: #388e3c;
  font-weight: 500;
}
</style>
