/**
 * 统一 API 请求工具
 * 自动携带 JWT Token，处理 401 跳转登录
 */

const BASE_URL = '/api'

function getToken() {
  return localStorage.getItem('token')
}

function setToken(token) {
  localStorage.setItem('token', token)
}

function removeToken() {
  localStorage.removeItem('token')
  localStorage.removeItem('isLogin')
}

function buildQueryString(params) {
  const us = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      us.append(key, value)
    }
  }
  return us.toString()
}

/**
 * GET 请求（自动携带 Token）
 * @param {string} url - 路径（不含 /api 前缀）
 * @param {object} params - 查询参数
 */
async function get(url, params = {}) {
  const qs = buildQueryString(params)
  const fullUrl = qs ? `${BASE_URL}${url}?${qs}` : `${BASE_URL}${url}`

  const token = getToken()
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(fullUrl, { method: 'GET', headers })

  if (res.status === 401) {
    removeToken()
    window.location.href = '/login'
    throw new Error('登录已过期，请重新登录')
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.msg || '权限不足')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.msg || `请求失败: ${res.status}`)
  }

  return res.json()
}

/**
 * POST 请求（JSON body，自动携带 Token）
 */
async function post(url, data = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  })

  if (res.status === 401) {
    removeToken()
    window.location.href = '/login'
    throw new Error('登录已过期，请重新登录')
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.msg || '权限不足')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.msg || `请求失败: ${res.status}`)
  }

  return res.json()
}

export default {
  get,
  post,
  getToken,
  setToken,
  removeToken
}
