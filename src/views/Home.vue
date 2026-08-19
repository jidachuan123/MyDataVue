<script setup>
import { useRouter } from 'vue-router'
import request from '../utils/request'

const router = useRouter()
const username = localStorage.getItem('realName') || localStorage.getItem('username') || '用户'

const logout = () => {
  request.removeToken()
  router.push('/login')
}

const cards = [
  {
    key: 'sales1',
    title: '销售详情1（数据中台）',
    desc: '部门 × 门店 × 商品维度：环比(MOM) / 同比(YOY) 销售额、毛利额、来客数、客单价、增长率等 200+ 指标预计算秒查。',
    path: '/sales-detail-1',
    icon: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm4 4h6v2H9V9zm0 4h6v2H9v-2z'
  },
  {
    key: 'sales2',
    title: '销售详情2（数据中台）',
    desc: '销售详情2 预计算版（两页签：环比、同比），按原销售详情2 的 Excel 两页签逻辑复刻 25 + 15 列。',
    path: '/sales-detail-2',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'
  }
]
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <h1>数据中台</h1>
      <p class="subtitle">欢迎回来，{{ username }}！请选择下方的分析报表</p>
    </section>

    <section class="card-grid">
      <div
        v-for="card in cards"
        :key="card.key"
        class="data-card"
        @click="router.push(card.path)"
      >
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path :d="card.icon" />
          </svg>
        </div>
        <h3>{{ card.title }}</h3>
        <p>{{ card.desc }}</p>
        <span class="enter">进入报表 →</span>
      </div>

      <!-- 占位：以后可继续新增报表入口 -->
      <div class="data-card placeholder">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </div>
        <h3>更多报表</h3>
        <p>后续可在此接入会员分析、商品分析、库存分析等数据中台模块。</p>
        <span class="enter">敬请期待</span>
      </div>
    </section>

    <div class="logout-row">
      <a class="logout-btn" @click="logout">退出登录</a>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}
.hero {
  text-align: center;
  color: #fff;
  margin-bottom: 40px;
}
.hero h1 {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: 1px;
}
.hero .subtitle {
  margin-top: 12px;
  font-size: 1rem;
  opacity: 0.85;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}
.data-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 18px;
  padding: 30px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;
  display: flex;
  flex-direction: column;
}
.data-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.16);
}
.data-card.placeholder {
  opacity: 0.7;
  cursor: default;
}
.data-card.placeholder:hover {
  transform: none;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.1);
}
.card-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}
.card-icon svg {
  width: 28px;
  height: 28px;
}
.data-card h3 {
  font-size: 1.15rem;
  color: #2d3748;
  margin-bottom: 10px;
}
.data-card p {
  font-size: 0.9rem;
  color: #718096;
  line-height: 1.6;
  flex: 1;
}
.data-card .enter {
  margin-top: 18px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #667eea;
}
.logout-row {
  text-align: center;
  margin-top: 40px;
}
.logout-btn {
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 8px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.12);
  transition: background 0.2s;
}
.logout-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
