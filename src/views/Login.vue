<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '../utils/request'

const router = useRouter()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const handleLogin = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  if (!username.value.trim()) {
    errorMsg.value = '请输入用户名'
    return
  }
  if (!password.value.trim()) {
    errorMsg.value = '请输入密码'
    return
  }

  loading.value = true

  try {
    const res = await request.post('/consumer/auth/login', {
      username: username.value,
      password: password.value
    })

    if (res.code === 0 && res.result) {
      request.setToken(res.result.token)
      localStorage.setItem('isLogin', 'true')
      localStorage.setItem('username', res.result.username || '')
      localStorage.setItem('realName', res.result.realName || '')

      successMsg.value = '登录成功，正在跳转...'
      setTimeout(() => {
        router.push('/home')
      }, 800)
    } else {
      errorMsg.value = res.msg || '登录失败'
    }
  } catch (e) {
    errorMsg.value = e.message || '网络错误，请检查后端服务是否启动'
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push('/home')
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <!-- 返回箭头 -->
      <button class="back-btn" @click="goBack" title="返回首页">
        &#8592;
      </button>

      <!-- Logo 区域 -->
      <div class="login-header">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <h1>数据中台</h1>
        <p class="login-subtitle">销售数据分析平台</p>
      </div>

      <!-- 表单 -->
      <form class="login-form" @submit.prevent="handleLogin">
        <!-- 用户名 -->
        <div class="form-group">
          <label for="username">用户名</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              id="username"
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              autocomplete="username"
              @focus="errorMsg = ''"
            />
          </div>
        </div>

        <!-- 密码 -->
        <div class="form-group">
          <label for="password">密码</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
              @focus="errorMsg = ''"
            />
            <button type="button" class="toggle-pwd" @click="showPassword = !showPassword">
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <!-- 错误提示 -->
        <div class="alert error" v-if="errorMsg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ errorMsg }}</span>
        </div>

        <!-- 成功提示 -->
        <div class="alert success" v-if="successMsg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>{{ successMsg }}</span>
        </div>

        <!-- 登录按钮 -->
        <button type="submit" class="login-btn" :disabled="loading">
          <span v-if="loading" class="btn-spinner"></span>
          <span>{{ loading ? '登录中...' : '登 录' }}</span>
        </button>
      </form>

      <!-- 底部提示 -->
      <div class="login-footer">
        <p>演示账号：<code>admin</code> / <code>123456</code></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.18);
  padding: 48px 40px 36px;
  width: 100%;
  max-width: 420px;
  position: relative;
  animation: cardIn 0.5s ease;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 18px;
  left: 18px;
  width: 36px;
  height: 36px;
  border: none;
  background: #f5f5f5;
  color: #555;
  border-radius: 10px;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.back-btn:hover {
  background: #e8e8e8;
  color: #333;
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.logo-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.logo-icon svg {
  width: 28px;
  height: 28px;
}

.login-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2d3748;
  margin: 0 0 6px;
}

.login-subtitle {
  font-size: 0.88rem;
  color: #a0aec0;
  margin: 0;
}

/* 表单 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #4a5568;
  margin-left: 2px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #cbd5e0;
  pointer-events: none;
}

.input-wrapper input {
  width: 100%;
  padding: 13px 14px 13px 42px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #2d3748;
  background: #f7fafc;
  transition: all 0.2s;
  outline: none;
  font-family: inherit;
}

.input-wrapper input::placeholder {
  color: #cbd5e0;
}

.input-wrapper input:focus {
  border-color: #667eea;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12);
}

.toggle-pwd {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 8px 12px;
  transition: color 0.2s;
}

.toggle-pwd:hover {
  color: #667eea;
}

/* 提示框 */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 0.88rem;
  animation: alertIn 0.3s ease;
}

@keyframes alertIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.alert.error {
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #fed7d7;
}

.alert.success {
  background: #f0fff4;
  color: #276749;
  border: 1px solid #c6f6d5;
}

/* 登录按钮 */
.login-btn {
  margin-top: 4px;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部 */
.login-footer {
  margin-top: 24px;
  text-align: center;
}

.login-footer p {
  font-size: 0.82rem;
  color: #a0aec0;
}

.login-footer code {
  background: #edf2f7;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Consolas', 'Courier New', monospace;
  color: #667eea;
  font-weight: 600;
}
</style>
