<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import request from '../utils/request'

const router = useRouter()

const goodsList = ref([])
const loading = ref(true)
const error = ref('')
const total = ref(0)
const ccodes = ref([])

const query = reactive({
  page: 1,
  size: 5,
  keyword: '',
  ccode: ''
})

const totalPages = computed(() => Math.ceil(total.value / query.size) || 1)
const pages = computed(() => {
  const p = []
  const tp = totalPages.value
  let start = Math.max(1, query.page - 2)
  let end = Math.min(tp, query.page + 2)
  if (end - start < 4) {
    if (start === 1) end = Math.min(tp, start + 4)
    else start = Math.max(1, end - 4)
  }
  for (let i = start; i <= end; i++) p.push(i)
  return p
})

async function fetchGoods() {
  loading.value = true
  error.value = ''
  try {
    const params = { page: query.page, size: query.size }
    if (query.keyword) params.keyword = query.keyword
    if (query.ccode) params.ccode = query.ccode

    const data = await request.get('/consumer/user/list', params)
    console.log('fetchGoods response:', data)
    goodsList.value = data.result || []
    total.value = data.total || 0
  } catch (e) {
    error.value = e.message || '无法连接后端服务'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function fetchCcodes() {
  try {
    const data = await request.get('/consumer/user/ccodes')
    console.log('fetchCcodes response:', data)
    ccodes.value = data.result || []
  } catch (e) { /* ignore */ }
}

function search() {
  query.page = 1
  fetchGoods()
}

function reset() {
  query.keyword = ''
  query.ccode = ''
  query.page = 1
  fetchGoods()
}

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  query.page = p
  fetchGoods()
}

function showDetail(goods) {
  const lines = []
  if (goods.c_gcode) lines.push('商品编码: ' + goods.c_gcode)
  if (goods.c_barcode) lines.push('条码: ' + goods.c_barcode)
  if (goods.c_pluno) lines.push('PLU号: ' + goods.c_pluno)
  if (goods.c_ccode) lines.push('品类编码: ' + goods.c_ccode)
  if (goods.c_name) lines.push('名称: ' + goods.c_name)
  if (goods.c_model) lines.push('规格: ' + goods.c_model)
  if (goods.c_basic_unit) lines.push('单位: ' + goods.c_basic_unit)
  if (goods.c_advice_price) lines.push('建议售价: ' + goods.c_advice_price)
  if (goods.c_produce) lines.push('产地: ' + goods.c_produce)
  if (goods.c_status) lines.push('状态: ' + goods.c_status)
  if (goods.c_adno) lines.push('部门: ' + goods.c_adno)
  alert(lines.join('\n'))
}

onMounted(() => {
  fetchGoods()
  fetchCcodes()
})
</script>

<template>
  <div class="goods-panel">
    <div class="panel-header">
      <h2>商品列表</h2>
      <span class="count-badge" v-if="!loading && !error">共 {{ total }} 件商品</span>
    </div>

    <!-- 搜索过滤栏 -->
    <div class="search-bar">
      <div class="search-input-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="query.keyword"
          type="text"
          placeholder="搜索商品编码 / 条码 / 名称 / PLU号"
          @keyup.enter="search"
        />
      </div>
      <select v-model="query.ccode" @change="search">
        <option value="">全部品类</option>
        <option v-for="c in ccodes" :key="c.c_ccode" :value="c.c_ccode">
          {{ c.c_ccode }}
        </option>
      </select>
      <button class="btn-search" @click="search">搜索</button>
      <button class="btn-reset" @click="reset">重置</button>
    </div>

    <!-- Loading -->
    <div class="state-box" v-if="loading">
      <div class="spinner"></div>
      <p>正在加载商品数据...</p>
    </div>

    <!-- Error -->
    <div class="state-box error" v-else-if="error">
      <div class="error-icon">&#9888;</div>
      <p>{{ error }}</p>
      <button class="btn-retry" @click="fetchGoods">重新加载</button>
    </div>

    <!-- 商品表格 -->
    <template v-else>
      <div class="table-wrap">
        <table class="goods-table">
          <thead>
            <tr>
              <th style="width:50px">序号</th>
              <th>商品编码</th>
              <th>商品条码</th>
              <th>商品名称</th>
              <th>规格</th>
              <th>单位</th>
              <th class="num">建议售价</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in goodsList" :key="item.c_gcode"
              :class="idx % 2 === 1 ? 'odd' : ''"
              @click="showDetail(item)">
              <td>{{ (query.page - 1) * query.size + idx + 1 }}</td>
              <td><span class="code">{{ item.c_gcode || '-' }}</span></td>
              <td>{{ item.c_barcode || '-' }}</td>
              <td class="name-cell">{{ item.c_name || '-' }}</td>
              <td>{{ item.c_model || '-' }}</td>
              <td>{{ item.c_basic_unit || '-' }}</td>
              <td class="num">{{ item.c_advice_price ? '¥' + Number(item.c_advice_price).toFixed(2) : '-' }}</td>
            </tr>
            <tr v-if="goodsList.length === 0">
              <td colspan="7" class="empty-msg">暂无商品数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pager" v-if="total > 0">
        <span class="pager-info">第 {{ (query.page - 1) * query.size + 1 }} - {{ Math.min(query.page * query.size, total) }} 条，共 {{ total }} 条</span>
        <div class="pager-btns">
          <button :disabled="query.page <= 1" @click="goPage(1)">首页</button>
          <button :disabled="query.page <= 1" @click="goPage(query.page - 1)">上一页</button>
          <button
            v-for="p in pages" :key="p"
            :class="['page-num', { active: p === query.page }]"
            @click="goPage(p)"
          >{{ p }}</button>
          <button :disabled="query.page >= totalPages" @click="goPage(query.page + 1)">下一页</button>
          <button :disabled="query.page >= totalPages" @click="goPage(totalPages)">末页</button>
        </div>
      </div>
    </template>

    <!-- 登录按钮 -->
    <div class="login-section" v-if="!loading && !error">
      <div class="divider">
        <span>账户操作</span>
      </div>
      <button class="btn-login" @click="router.push('/login')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        登录系统
      </button>
    </div>
  </div>
</template>

<style scoped>
.goods-panel {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}
.panel-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
}
.count-badge {
  background: rgba(255,255,255,0.25);
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 24px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
  flex-wrap: wrap;
}
.search-input-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
}
.search-input-wrap .search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 17px;
  height: 17px;
  color: #bbb;
}
.search-input-wrap input {
  width: 100%;
  padding: 8px 8px 8px 34px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color .2s;
  box-sizing: border-box;
}
.search-input-wrap input:focus {
  border-color: #667eea;
}
.search-bar select {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: #fff;
  min-width: 120px;
}
.btn-search {
  background: #667eea;
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background .2s;
}
.btn-search:hover { background: #5a6fd6; }
.btn-reset {
  background: #fff;
  color: #666;
  border: 1px solid #d9d9d9;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all .2s;
}
.btn-reset:hover { border-color: #667eea; color: #667eea; }

/* State */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 20px;
  color: #666;
}
.state-box.error { color: #c0392b; }
.error-icon { font-size: 3rem; }
.spinner {
  width: 40px; height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.btn-retry {
  background: #667eea;
  color: #fff;
  border: none;
  padding: 10px 28px;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
}

/* 表格 */
.table-wrap { overflow-x: auto; padding: 16px 24px; }
.goods-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.goods-table thead th {
  background: #f5f5f5;
  color: #333;
  font-weight: 600;
  padding: 10px 12px;
  border-bottom: 2px solid #e0e0e0;
  text-align: center;
  white-space: nowrap;
}
.goods-table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  text-align: center;
  cursor: pointer;
  transition: background .15s;
}
.goods-table tbody tr:hover { background: #eef0ff; }
.goods-table tbody tr.odd { background: #fafafa; }
.goods-table tbody tr.odd:hover { background: #eef0ff; }
.goods-table .num { text-align: right; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.goods-table .name-cell { text-align: left; }
.goods-table .code { font-family: monospace; color: #667eea; font-size: 12px; }
.empty-msg { color: #999; padding: 30px !important; cursor: default !important; }

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px 18px;
  flex-wrap: wrap;
  gap: 12px;
}
.pager-info { font-size: 12px; color: #888; }
.pager-btns { display: flex; gap: 4px; }
.pager-btns button {
  padding: 5px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  transition: all .15s;
}
.pager-btns button:hover:not(:disabled) { border-color: #667eea; color: #667eea; }
.pager-btns button:disabled { color: #ccc; cursor: not-allowed; }
.pager-btns .page-num.active {
  background: #667eea;
  color: #fff;
  border-color: #667eea;
}

/* 登录按钮 */
.login-section { padding: 8px 24px 20px; }
.divider {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 14px; color: #cbd5e0; font-size: 0.8rem;
}
.divider::before, .divider::after {
  content: ''; flex: 1; height: 1px; background: #e2e8f0;
}
.btn-login {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px;
  border: 2px dashed #cbd5e0;
  border-radius: 12px;
  background: #fafbff;
  color: #667eea;
  font-size: 1rem; font-weight: 600;
  cursor: pointer;
  transition: all .25s;
}
.btn-login svg { width: 20px; height: 20px; transition: transform .25s; }
.btn-login:hover {
  border-color: #667eea; border-style: solid;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
  transform: translateY(-1px);
}
.btn-login:hover svg { transform: translateX(4px); }
</style>
