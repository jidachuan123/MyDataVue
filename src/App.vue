<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from './utils/request'

const route = useRoute()
const router = useRouter()
const isLoginPage = ref(route.path === '/login')

watch(() => route.path, (newPath) => {
  isLoginPage.value = newPath === '/login'
})

const logout = () => {
  request.removeToken()
  router.push('/login')
}
</script>

<template>
  <div class="app-container">
    <header class="app-header" v-if="!isLoginPage">
      <h1>数据中台</h1>
      <p class="subtitle">销售数据分析平台</p>
      <nav class="nav-links">
        <router-link to="/home" active-class="active">主页</router-link>
        <router-link to="/sales-detail-1" active-class="active">销售详情1(数据中台)</router-link>
        <router-link to="/sales-detail-2" active-class="active">销售详情2(数据中台)</router-link>
        <a class="logout-btn" @click="logout">退出</a>
      </nav>
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}
.app-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 40px 20px;
}
.app-header {
  text-align: center;
  color: #fff;
  margin-bottom: 40px;
}
.app-header h1 {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 1px;
}
.subtitle {
  font-size: 0.95rem;
  opacity: 0.75;
  margin-top: 8px;
}
.nav-links {
  margin-top: 14px;
  display: flex;
  justify-content: center;
  gap: 20px;
}
.nav-links a {
  color: #fff;
  text-decoration: none;
  padding: 4px 12px;
  border-radius: 4px;
  transition: background .2s;
  font-size: 14px;
}
.nav-links a:hover,
.nav-links a.active {
  background: rgba(255,255,255,0.2);
}
.logout-btn {
  color: #fff;
  cursor: pointer;
  opacity: 0.7;
}
.logout-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.2);
}
</style>
