<script setup>
/**
 * 销售详情1（数据中台）—— 预计算版（查 dw.rpt_sale_detail_precompute，秒级）
 *
 * 与原 SalesDetail.vue（销售详情1，引擎直查）的区别：
 *   1. 取数接口改为 /provider/sales/precompute（每天凌晨 2:00 已跑批，静态查表 <100ms）
 *   2. 查询条件简化为「业务日期」（预计算表 query_date 为单日）+ 机构编码
 *   3. 顶部新增「预计算管理」面板：手动触发回补（输入任意历史日期）+ 最近跑批记录
 *
 * 原销售详情1 保留不动，作为对账基准。
 */
import { ref, computed, onMounted } from 'vue'
import request from '../utils/request'

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
    orgCode: '1101001'
  }
}

const queryForm = ref(defaultQueryForm())
const deptGroupFilter = ref('')
const showYoY = ref(true)
const showMoM = ref(true)

// ========== API 数据 ==========
const apiData = ref(null)
const apiLoading = ref(false)
const apiError = ref('')
// 同比数据：comparisonType=YOY 那次查询（只取同比三列渲染）
const apiDataYoY = ref(null)
const deptSummary = ref(null)      // deptLevels=2 部门合计（环比）
const storeTotal = ref(null)       // deptLevels=空 机构汇总（环比）
const deptSummaryYoY = ref(null)   // deptLevels=2 部门合计（同比）
const storeTotalYoY = ref(null)    // deptLevels=空 机构汇总（同比）

async function fetchData() {
  apiLoading.value = true
  apiError.value = ''
  try {
    const cmpBase = {
      queryDate: queryForm.value.queryDate,
      orgCode: queryForm.value.orgCode
    }
    const moM = { comparisonType: 'MOM' }
    const yoY = { comparisonType: 'YOY' }
    // 明细(deptLevels=3) + 部门合计(deptLevels=2) + 超市总计(deptLevels 不传=机构汇总)，各按环比/同比查一遍
    // deptLevels 传 '' 时请求封装过滤空值不发送 → 后端默认空 = 机构汇总
    const [detail, detailYoY, lv2, lv1, lv2YoY, lv1YoY] = await Promise.all([
      request.get('/provider/sales/precompute', { ...cmpBase, ...moM, deptLevels: '3' }),
      request.get('/provider/sales/precompute', { ...cmpBase, ...yoY, deptLevels: '3' }),
      request.get('/provider/sales/precompute', { ...cmpBase, ...moM, deptLevels: '2' }),
      request.get('/provider/sales/precompute', { ...cmpBase, ...moM, deptLevels: '' }),
      request.get('/provider/sales/precompute', { ...cmpBase, ...yoY, deptLevels: '2' }),
      request.get('/provider/sales/precompute', { ...cmpBase, ...yoY, deptLevels: '' })
    ])
    apiData.value = detail
    apiDataYoY.value = detailYoY
    // 去掉部门为"行政部"的条；总计那两遍 deptLevels 不传返回机构汇总（部门名称1 为空，不受此过滤影响）
    deptSummary.value = lv2 ? lv2.filter(r => r['部门名称2'] !== '行政部') : null
    storeTotal.value = lv1 ? lv1.filter(r => r['部门名称1'] !== '行政部') : null
    deptSummaryYoY.value = lv2YoY ? lv2YoY.filter(r => r['部门名称2'] !== '行政部') : null
    storeTotalYoY.value = lv1YoY ? lv1YoY.filter(r => r['部门名称1'] !== '行政部') : null
  } catch (e) {
    apiError.value = '数据加载失败: ' + (e.message || '未知错误')
    apiData.value = null
    apiDataYoY.value = null
    deptSummary.value = null
    storeTotal.value = null
    deptSummaryYoY.value = null
    storeTotalYoY.value = null
  } finally {
    apiLoading.value = false
  }
}

function resetForm() {
  queryForm.value = defaultQueryForm()
  deptGroupFilter.value = ''
  apiData.value = null
  apiDataYoY.value = null
  deptSummary.value = null
  storeTotal.value = null
  deptSummaryYoY.value = null
  storeTotalYoY.value = null
  apiError.value = ''
}

// ========== 预计算管理（手动触发回补 + 最近跑批记录） ==========
const triggerForm = ref({ date: defaultQueryForm().queryDate, orgCodes: '1101001' })
const triggering = ref(false)
const triggerMsg = ref('')
const batchLogs = ref([])

async function loadLogs() {
  try {
    batchLogs.value = await request.get('/provider/sales/precompute/logs', { limit: 20 })
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
  triggerMsg.value = `跑批中（${orgs.length} 个机构 × 三档全量重算，约 ${orgs.length * 1}-2 分钟），请稍候...`
  try {
    // orgCode 支持多个，英文逗号分隔；后端逐个机构跑批（幂等）
    const r = await request.post('/provider/sales/precompute/trigger?queryDate=' + triggerForm.value.date + '&orgCode=' + encodeURIComponent(orgs.join(',')), {})
    triggerMsg.value = r.message || (r.code === 0 ? '跑批完成' : '跑批失败')
    if (r.code === 0) {
      // 跑批完成后自动刷新表格与日志；查询机构自动切为跑批的第一个机构
      queryForm.value.queryDate = triggerForm.value.date
      queryForm.value.orgCode = orgs[0]
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
  fetchData()
  loadLogs()
})

// ========== 辅助函数 ==========
function sum(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}
function priorValue(current, rate) {
  if (rate == null) return current
  return current / (1 + rate / 100)
}
function calcRate(curSum, priorSum) {
  if (!priorSum || priorSum === 0) return 0
  return Number((((curSum - priorSum) / Math.abs(priorSum)) * 100).toFixed(2))
}
// 判断行集合中某字段是否至少有一个非空值（用于小计/总计同比的空白判定）
function hasAny(rows, field) {
  return rows.some(r => r[field] !== null && r[field] !== undefined)
}

// ========== 数值辅助 ==========
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
function pct2(v) {
  const n = num(v)
  return n === null ? null : Math.round(n * 100) / 100
}
function momRate(cur, prior) {
  const c = num(cur)
  const p = num(prior)
  if (c === null || p === null) return null
  return calcRate(c, p)
}

// ========== 合并数据源 ==========
function getDeptGroup(code) {
  if (!code) return ''
  const prefix = String(code).substring(0, 2)
  const map = { '11': '生鲜一部', '12': '生鲜二部', '13': '食品部', '15': '非食部' }
  return map[prefix] || ''
}

const sourceData = computed(() => {
  const api = apiData.value
  if (!api || !api.length) return []
  // 按「部门编码3」建立同比映射，明细行按编码取同比三列，避免按索引错位
  const yoyByCode = new Map()
  for (const r of (apiDataYoY.value || [])) {
    const code = r['部门编码3']
    if (code !== null && code !== undefined && !yoyByCode.has(String(code))) {
      yoyByCode.set(String(code), r)
    }
  }
  return api.map((ar) => {
    const deptCode = ar['部门编码3'] ?? null
    const y = deptCode !== null && deptCode !== undefined ? yoyByCode.get(String(deptCode)) : undefined
    return {
      orgName: ar['机构名称'] ?? null,
      deptGroup: getDeptGroup(deptCode),
      deptCode,
      deptName: ar['部门名称3'] ?? null,
      salesAmount: num(ar['销售金额']),
      salesMoM: pct2(ar['销售额增长率']),
      profitAmount: num(ar['含税毛利']),
      profitMoM: pct2(ar['毛利额增长率']),
      profitRate: pct2(ar['毛利率']),
      customers: num(ar['交易笔数']),
      customerMoM: momRate(ar['交易笔数'], ar['对期交易笔数']),
      avgPrice: num(ar['客单价']),
      avgPriceMoM: momRate(ar['客单价'], ar['对期客单价']),
      salesYoY: y ? pct2(y['销售额增长率']) : null,
      profitYoY: y ? pct2(y['毛利额增长率']) : null,
      customerYoY: y ? momRate(y['交易笔数'], y['对期交易笔数']) : null,
      avgPriceYoY: y ? momRate(y['客单价'], y['对期客单价']) : null,
    }
  })
})

// ========== 构建表格数据（含小计和总计） ==========
function buildRowFromApi(ar, deptName, isSubtotal, isTotal, yoyAr) {
  return {
    orgName: '', deptGroup: '', deptCode: '',
    deptName,
    salesAmount: num(ar['销售金额']),
    salesYoY: yoyAr ? pct2(yoyAr['销售额增长率']) : null,
    salesMoM: pct2(ar['销售额增长率']),
    profitAmount: num(ar['含税毛利']),
    profitYoY: yoyAr ? pct2(yoyAr['毛利额增长率']) : null,
    profitMoM: pct2(ar['毛利额增长率']),
    profitRate: pct2(ar['毛利率']),
    customers: num(ar['交易笔数']),
    customerYoY: yoyAr ? momRate(yoyAr['交易笔数'], yoyAr['对期交易笔数']) : null,
    customerMoM: momRate(ar['交易笔数'], ar['对期交易笔数']),
    avgPrice: num(ar['客单价']),
    avgPriceYoY: yoyAr ? momRate(yoyAr['客单价'], yoyAr['对期客单价']) : null,
    avgPriceMoM: momRate(ar['客单价'], ar['对期客单价']),
    isSubtotal: !!isSubtotal,
    isTotal: !!isTotal
  }
}

// 回退逻辑：部门级(deptLevels=2)接口行缺失时，由明细行累加计算小计
function buildSubtotalBySum(rows, g) {
  const curSales = sum(rows, 'salesAmount')
  const curProfit = sum(rows, 'profitAmount')
  const curCustomers = sum(rows, 'customers')

  const priorYoY = { sales: 0, profit: 0, customers: 0 }
  const priorMoM = { sales: 0, profit: 0, customers: 0 }
  for (const r of rows) {
    priorYoY.sales    += priorValue(r.salesAmount, r.salesYoY)
    priorYoY.profit   += priorValue(r.profitAmount, r.profitYoY)
    priorYoY.customers += priorValue(r.customers, r.customerYoY)
    priorMoM.sales    += priorValue(r.salesAmount, r.salesMoM)
    priorMoM.profit   += priorValue(r.profitAmount, r.profitMoM)
    priorMoM.customers += priorValue(r.customers, r.customerMoM)
  }

  const profitRate = curSales > 0 ? Number(((curProfit / curSales) * 100).toFixed(2)) : 0
  const avgPrice = curCustomers > 0 ? Math.round(curSales / curCustomers) : 0

  const salesYoY    = hasAny(rows, 'salesYoY') ? calcRate(curSales, priorYoY.sales) : null
  const salesMoM    = calcRate(curSales, priorMoM.sales)
  const profitYoY   = hasAny(rows, 'profitYoY') ? calcRate(curProfit, priorYoY.profit) : null
  const profitMoM   = calcRate(curProfit, priorMoM.profit)
  const customerYoY = hasAny(rows, 'customerYoY') ? calcRate(curCustomers, priorYoY.customers) : null
  const customerMoM = calcRate(curCustomers, priorMoM.customers)
  const priorAvgPriceYoY = priorYoY.customers > 0 ? (priorYoY.sales / priorYoY.customers) : 0
  const priorAvgPriceMoM = priorMoM.customers > 0 ? (priorMoM.sales / priorMoM.customers) : 0
  const avgPriceYoY = hasAny(rows, 'avgPriceYoY') && priorAvgPriceYoY > 0 ? calcRate(avgPrice, priorAvgPriceYoY) : null
  const avgPriceMoM = priorAvgPriceMoM > 0 ? calcRate(avgPrice, priorAvgPriceMoM) : 0

  return {
    orgName: '', deptGroup: '', deptCode: '', deptName: `${g} 合计`,
    salesAmount: curSales, salesYoY, salesMoM,
    profitAmount: curProfit, profitYoY, profitMoM,
    profitRate, customers: curCustomers, customerYoY, customerMoM,
    avgPrice, avgPriceYoY, avgPriceMoM,
    isSubtotal: true
  }
}

// 回退逻辑：超市(deptLevels=空)接口行缺失时，由明细行累加计算总计
function buildTotalBySum(detailRows) {
  const tSales = sum(detailRows, 'salesAmount')
  const tProfit = sum(detailRows, 'profitAmount')
  const tCustomers = sum(detailRows, 'customers')

  const tPriorYoY = { sales: 0, profit: 0, customers: 0 }
  const tPriorMoM = { sales: 0, profit: 0, customers: 0 }
  for (const r of detailRows) {
    tPriorYoY.sales    += priorValue(r.salesAmount, r.salesYoY)
    tPriorYoY.profit   += priorValue(r.profitAmount, r.profitYoY)
    tPriorYoY.customers += priorValue(r.customers, r.customerYoY)
    tPriorMoM.sales    += priorValue(r.salesAmount, r.salesMoM)
    tPriorMoM.profit   += priorValue(r.profitAmount, r.profitMoM)
    tPriorMoM.customers += priorValue(r.customers, r.customerMoM)
  }

  const tProfitRate = tSales > 0 ? Number(((tProfit / tSales) * 100).toFixed(2)) : 0
  const tAvgPrice = tCustomers > 0 ? Math.round(tSales / tCustomers) : 0

  const tSalesYoY    = hasAny(detailRows, 'salesYoY') ? calcRate(tSales, tPriorYoY.sales) : null
  const tSalesMoM    = calcRate(tSales, tPriorMoM.sales)
  const tProfitYoY   = hasAny(detailRows, 'profitYoY') ? calcRate(tProfit, tPriorYoY.profit) : null
  const tProfitMoM   = calcRate(tProfit, tPriorMoM.profit)
  const tCustomerYoY = hasAny(detailRows, 'customerYoY') ? calcRate(tCustomers, tPriorYoY.customers) : null
  const tCustomerMoM = calcRate(tCustomers, tPriorMoM.customers)
  const tPriorAvgPriceYoY = tPriorYoY.customers > 0 ? (tPriorYoY.sales / tPriorYoY.customers) : 0
  const tPriorAvgPriceMoM = tPriorMoM.customers > 0 ? (tPriorMoM.sales / tPriorMoM.customers) : 0
  const tAvgPriceYoY = hasAny(detailRows, 'avgPriceYoY') && tPriorAvgPriceYoY > 0 ? calcRate(tAvgPrice, tPriorAvgPriceYoY) : null
  const tAvgPriceMoM = tPriorAvgPriceMoM > 0 ? calcRate(tAvgPrice, tPriorAvgPriceMoM) : 0

  return {
    orgName: '', deptGroup: '', deptCode: '', deptName: '超市总计',
    salesAmount: tSales, salesYoY: tSalesYoY, salesMoM: tSalesMoM,
    profitAmount: tProfit, profitYoY: tProfitYoY, profitMoM: tProfitMoM,
    profitRate: tProfitRate, customers: tCustomers, customerYoY: tCustomerYoY, customerMoM: tCustomerMoM,
    avgPrice: tAvgPrice, avgPriceYoY: tAvgPriceYoY, avgPriceMoM: tAvgPriceMoM,
    isTotal: true
  }
}

const tableData = computed(() => {
  const data = sourceData.value
  const result = []

  const groups = ['生鲜一部', '生鲜二部', '食品部', '非食部']

  for (const g of groups) {
    const rows = data.filter(r => r.deptGroup === g)
    if (!rows.length) continue
    result.push(...rows)

    const src = (deptSummary.value || []).find(r => r['部门名称2'] === g)
    const yoySrc = (deptSummaryYoY.value || []).find(r => r['部门名称2'] === g)
    const subtotal = src ? buildRowFromApi(src, `${g} 合计`, true, false, yoySrc)
                         : buildSubtotalBySum(rows, g)
    result.push(subtotal)
  }

  // ── 总计行 ──
  const allDetail = result.filter(r => !r.isSubtotal)
  const src = (storeTotal.value || []).find(r => r['部门名称1'] === '超市') || (storeTotal.value || [])[0]
  const yoySrc = (storeTotalYoY.value || []).find(r => r['部门名称1'] === '超市') || (storeTotalYoY.value || [])[0]
  const total = src ? buildRowFromApi(src, '超市总计', false, true, yoySrc)
                    : buildTotalBySum(allDetail)
  result.push(total)

  return result
})

// 实际展示的明细条数（不含小计/总计；包装耗材等未归组行被过滤后不计入）
const loadedCount = computed(() =>
  tableData.value.filter(r => !r.isSubtotal && !r.isTotal).length
)

// ========== 格式化 ==========
function formatAmount(n) {
  if (n === undefined || n === null) return ''
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatRate(val) {
  if (val === undefined || val === null) return ''
  const prefix = val > 0 ? '+' : ''
  return prefix + Number(val).toFixed(2) + '%'
}
function formatPct(val) {
  if (val === undefined || val === null) return ''
  return val + '%'
}
function getRateClass(val) {
  if (val === undefined || val === null) return ''
  if (val > 0) return 'rate-up'
  if (val < 0) return 'rate-down'
  return ''
}
// 时间戳显示（etl_time 是 ISO 字符串，截取到秒）
function fmtTime(v) {
  if (!v) return ''
  return String(v).replace('T', ' ').substring(0, 19)
}

// ========== 导出 Excel (CSV) ==========
function exportExcel() {
  let headers = [
    '机构名称', '部组名称', '部门编码', '部门名称',
    '销售额/元'
  ]
  if (showYoY.value) headers.push('同比销售额增长率')
  if (showMoM.value) headers.push('环比销售额增长率')
  headers.push('毛利额/元')
  if (showYoY.value) headers.push('同比毛利额增长率')
  if (showMoM.value) headers.push('环比毛利额增长率')
  headers.push('毛利率', '来客数')
  if (showYoY.value) headers.push('同比来客数增长率')
  if (showMoM.value) headers.push('环比来客数增长率')
  headers.push('客单价/元')
  if (showYoY.value) headers.push('同比客单价增长率')
  if (showMoM.value) headers.push('环比客单价增长率')

  let csv = '\uFEFF' + headers.join(',') + '\n'

  for (const row of tableData.value) {
    let values = [
      row.orgName, row.deptGroup, row.deptCode, row.deptName,
      row.salesAmount
    ]
    if (showYoY.value) values.push(formatRate(row.salesYoY))
    if (showMoM.value) values.push(formatRate(row.salesMoM))
    values.push(row.profitAmount)
    if (showYoY.value) values.push(formatRate(row.profitYoY))
    if (showMoM.value) values.push(formatRate(row.profitMoM))
    values.push(formatPct(row.profitRate), row.customers)
    if (showYoY.value) values.push(formatRate(row.customerYoY))
    if (showMoM.value) values.push(formatRate(row.customerMoM))
    values.push(row.avgPrice)
    if (showYoY.value) values.push(formatRate(row.avgPriceYoY))
    if (showMoM.value) values.push(formatRate(row.avgPriceMoM))

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
  link.download = '销售详情1_数据中台_' + (queryForm.value.queryDate || '') + '.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <div class="sales-detail-page">
    <!-- 标题区域 -->
    <div class="page-header">
      <h2>部门销售详情1（数据中台）</h2>
      <div class="date-info">
        <span class="tag current">业务日期：{{ queryForm.queryDate }}</span>
        <span v-if="apiData" class="tag loaded">已加载 {{ loadedCount }} 条数据（查预计算表）</span>
        <span class="tag note">凌晨 2:00 自动跑批，数据来自 dw.rpt_sale_detail_precompute</span>
      </div>
      <div class="toggle-row">
        <label class="toggle-item">
          <input type="checkbox" v-model="showYoY" /> 显示同比
        </label>
        <label class="toggle-item">
          <input type="checkbox" v-model="showMoM" /> 显示环比
        </label>
        <span class="toggle-item toggle-mode">
          合计取值：部门合计
        </span>
      </div>
    </div>

    <!-- 预计算管理面板 -->
    <div class="manage-panel">
      <h3>⚡ 预计算管理（dw.rpt_sale_detail_precompute）</h3>
      <div class="manage-row">
        <div class="query-item">
          <label>业务日期:</label>
          <input type="date" v-model="triggerForm.date" />
        </div>
        <div class="query-item">
          <label>机构编码:</label>
          <input type="text" v-model="triggerForm.orgCodes" placeholder="多个用逗号分隔，如 1101001,1102" style="width:230px" />
        </div>
        <button class="btn-trigger" @click="triggerPrecompute" :disabled="triggering">
          {{ triggering ? '跑批中...' : '▶ 手动触发回补' }}
        </button>
        <span class="trigger-msg" :class="{ 'msg-err': triggerMsg && triggerMsg.indexOf('失败') >= 0 }">{{ triggerMsg }}</span>
        <span class="trigger-hint">支持多个机构（逗号分隔）逐个跑批；输入昨天可补跑凌晨失败的数据，输入任意历史日期可重算覆盖（幂等）</span>
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
      <div v-else class="log-empty">暂无跑批记录（每天凌晨 2:00 定时任务将自动生成；也可手动触发）</div>
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
          <input type="text" v-model="queryForm.orgCode" placeholder="如 1101001" style="width:100px" />
        </div>
        <div class="query-item">
          <label>部组名称:</label>
          <select v-model="deptGroupFilter">
            <option value="">全部</option>
            <option>生鲜一部</option>
            <option>生鲜二部</option>
            <option>食品部</option>
            <option>非食部</option>
          </select>
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

    <!-- 表格 -->
    <div class="table-wrapper">
      <table class="sales-table">
        <thead>
          <tr>
            <th class="col-org">机构名称</th>
            <th class="col-group">部组名称</th>
            <th class="col-code">部门编码</th>
            <th class="col-name">部门名称</th>
            <th class="col-num col-sales">销售额/元</th>
            <th class="col-rate col-sales" v-if="showYoY">同比<br>销售额增长率</th>
            <th class="col-rate col-sales" v-if="showMoM">环比<br>销售额增长率</th>
            <th class="col-num col-profit">毛利额/元</th>
            <th class="col-rate col-profit" v-if="showYoY">同比<br>毛利额增长率</th>
            <th class="col-rate col-profit" v-if="showMoM">环比<br>毛利额增长率</th>
            <th class="col-num col-profit">毛利率</th>
            <th class="col-num col-customer">来客数</th>
            <th class="col-rate col-customer" v-if="showYoY">同比<br>来客数增长率</th>
            <th class="col-rate col-customer" v-if="showMoM">环比<br>来客数增长率</th>
            <th class="col-num col-price">客单价/元</th>
            <th class="col-rate col-price" v-if="showYoY">同比<br>客单价增长率</th>
            <th class="col-rate col-price" v-if="showMoM">环比<br>客单价增长率</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, idx) in tableData" :key="idx">
            <!-- 小计行 -->
            <tr v-if="row.isSubtotal" class="subtotal">
              <td colspan="4" class="col-merge subtotal-label">{{ row.deptName }}</td>
              <td class="col-num col-sales">{{ formatAmount(row.salesAmount) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesYoY)]" v-if="showYoY">{{ formatRate(row.salesYoY) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesMoM)]" v-if="showMoM">{{ formatRate(row.salesMoM) }}</td>
              <td class="col-num col-profit">{{ formatAmount(row.profitAmount) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitYoY)]" v-if="showYoY">{{ formatRate(row.profitYoY) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitMoM)]" v-if="showMoM">{{ formatRate(row.profitMoM) }}</td>
              <td class="col-num col-profit">{{ formatPct(row.profitRate) }}</td>
              <td class="col-num col-customer">{{ formatAmount(row.customers) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerYoY)]" v-if="showYoY">{{ formatRate(row.customerYoY) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerMoM)]" v-if="showMoM">{{ formatRate(row.customerMoM) }}</td>
              <td class="col-num col-price">{{ formatAmount(row.avgPrice) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceYoY)]" v-if="showYoY">{{ formatRate(row.avgPriceYoY) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceMoM)]" v-if="showMoM">{{ formatRate(row.avgPriceMoM) }}</td>
            </tr>
            <!-- 总计行 -->
            <tr v-else-if="row.isTotal" class="total">
              <td colspan="4" class="col-merge total-label">{{ row.deptName }}</td>
              <td class="col-num col-sales">{{ formatAmount(row.salesAmount) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesYoY)]" v-if="showYoY">{{ formatRate(row.salesYoY) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesMoM)]" v-if="showMoM">{{ formatRate(row.salesMoM) }}</td>
              <td class="col-num col-profit">{{ formatAmount(row.profitAmount) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitYoY)]" v-if="showYoY">{{ formatRate(row.profitYoY) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitMoM)]" v-if="showMoM">{{ formatRate(row.profitMoM) }}</td>
              <td class="col-num col-profit">{{ formatPct(row.profitRate) }}</td>
              <td class="col-num col-customer">{{ formatAmount(row.customers) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerYoY)]" v-if="showYoY">{{ formatRate(row.customerYoY) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerMoM)]" v-if="showMoM">{{ formatRate(row.customerMoM) }}</td>
              <td class="col-num col-price">{{ formatAmount(row.avgPrice) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceYoY)]" v-if="showYoY">{{ formatRate(row.avgPriceYoY) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceMoM)]" v-if="showMoM">{{ formatRate(row.avgPriceMoM) }}</td>
            </tr>
            <!-- 明细行 -->
            <tr v-else :class="{ 'odd': idx % 2 === 1 }">
              <td class="col-org">{{ row.orgName }}</td>
              <td class="col-group">{{ row.deptGroup }}</td>
              <td class="col-code">{{ row.deptCode }}</td>
              <td class="col-name">{{ row.deptName }}</td>
              <td class="col-num col-sales">{{ formatAmount(row.salesAmount) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesYoY)]" v-if="showYoY">{{ formatRate(row.salesYoY) }}</td>
              <td :class="['col-rate', 'col-sales', getRateClass(row.salesMoM)]" v-if="showMoM">{{ formatRate(row.salesMoM) }}</td>
              <td class="col-num col-profit">{{ formatAmount(row.profitAmount) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitYoY)]" v-if="showYoY">{{ formatRate(row.profitYoY) }}</td>
              <td :class="['col-rate', 'col-profit', getRateClass(row.profitMoM)]" v-if="showMoM">{{ formatRate(row.profitMoM) }}</td>
              <td class="col-num col-profit">{{ formatPct(row.profitRate) }}</td>
              <td class="col-num col-customer">{{ formatAmount(row.customers) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerYoY)]" v-if="showYoY">{{ formatRate(row.customerYoY) }}</td>
              <td :class="['col-rate', 'col-customer', getRateClass(row.customerMoM)]" v-if="showMoM">{{ formatRate(row.customerMoM) }}</td>
              <td class="col-num col-price">{{ formatAmount(row.avgPrice) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceYoY)]" v-if="showYoY">{{ formatRate(row.avgPriceYoY) }}</td>
              <td :class="['col-rate', 'col-price', getRateClass(row.avgPriceMoM)]" v-if="showMoM">{{ formatRate(row.avgPriceMoM) }}</td>
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
  background: linear-gradient(135deg, #e8eaf6 0%, #e3f2fd 100%);
}
.page-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #1a237e;
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
.toggle-row {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 8px;
}
.toggle-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  user-select: none;
}
.toggle-item input {
  cursor: pointer;
}
.toggle-mode {
  gap: 8px;
  color: #333;
  font-weight: 500;
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
.query-item select,
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
.query-item select {
  min-width: 120px;
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
  border: 1px solid #d0d0d0;
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
  border: 1px solid #e8e8e8;
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
.col-org { min-width: 130px; }
.col-group { min-width: 80px; }
.col-code { min-width: 70px; }
.col-name { min-width: 100px; text-align: left !important; padding-left: 10px !important; }
.col-merge { text-align: center !important; font-weight: 700; font-size: 14px; letter-spacing: 2px; }
.col-num { min-width: 85px; text-align: center !important; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.col-rate { min-width: 70px; }

/* 列分组颜色 */
.col-sales { background: #fff3e0 !important; }
.col-profit { background: #e8f5e9 !important; }
.col-customer { background: #e3f2fd !important; }
.col-price { background: #fce4ec !important; }

/* 小计行 */
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

/* 总计行 */
.total {
  background: linear-gradient(90deg, #ffd54f 0%, #ffca28 100%) !important;
  color: #4e342e !important;
  font-weight: 800;
}
.total td {
  border-top: 2px solid #e65100 !important;
  border-bottom: 3px double #bf360c !important;
  color: #3e2723 !important;
}
.total:hover {
  background: linear-gradient(90deg, #ffc107 0%, #ffb300 100%) !important;
}

/* 增长率颜色（中国股市惯例：涨红跌绿） */
.rate-up {
  color: #d32f2f;
  font-weight: 500;
}
.rate-down {
  color: #388e3c;
  font-weight: 500;
}
</style>
