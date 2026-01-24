<template>
  <div class="manual-trading-container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>手动交易面板
            <span class="header-actions">
              <el-tag :type="store.config.isTestnet ? 'warning' : 'danger'" size="large">
                {{ store.config.isTestnet ? '模拟交易' : '真实交易' }}
              </el-tag>
            </span>
          </h1>
        </div>
      </el-header>

      <el-main class="main-content">
        <!-- 账户余额 -->
        <el-card shadow="hover" class="balance-card">
          <template #header>
            <div class="card-header">
              <span>账户余额</span>
              <div>
                <el-button type="primary" size="small" @click="testConnection" :loading="testing">
                  测试连接
                </el-button>
                <el-button type="success" size="small" @click="refreshBalance" :loading="loadingBalance">
                  刷新余额
                </el-button>
              </div>
            </div>
          </template>
          <el-row :gutter="10">
            <el-col :xs="12" :sm="8" :md="4" v-for="currency in ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL']" :key="currency">
              <div class="balance-item">
                <div class="balance-currency">{{ currency }}</div>
                <div class="balance-amount">{{ (store.balances[currency]?.free || 0).toFixed(currency === 'USDT' || currency === 'USDC' ? 2 : 6) }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 手动交易面板 -->
        <el-card shadow="hover" class="manual-trading-card">
          <template #header>
            <div class="card-header">
              <span>手动交易</span>
            </div>
          </template>
          <el-form :model="manualForm" label-width="80px">
            <el-form-item label="交易对">
              <el-select v-model="manualForm.symbol" placeholder="选择交易对" style="width: 160px;">
                <el-option
                  v-for="symbol in store.config.symbols"
                  :key="symbol"
                  :label="symbol"
                  :value="symbol"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="价格">
              <el-input-number v-model="manualForm.price" :min="0" :precision="5"/>
              <el-button type="primary" size="small" @click="getSymbolPrices">
                获取当前价格
              </el-button>
            </el-form-item>
            <el-form-item label="数量">
              <el-input-number v-model="manualForm.amount" :min="0" :precision="5"/>
              <el-tag type="info" size="small">
                USDT余额：{{ (store.balances['USDT']?.free || 0).toFixed(2) }}
              </el-tag>
            </el-form-item>
            <el-form-item>
              <el-button type="success" @click="handleManualBuy" :loading="manualLoading">
                手动买入
              </el-button>
              <el-button type="danger" @click="handleManualSell" :loading="manualLoading">
                手动卖出
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 当前价格显示 -->
        <el-card shadow="hover" class="price-card">
          <template #header>
            <div class="card-header">
              <span>当前价格</span>
              <el-button type="primary" size="small" @click="refreshAllPrices">
                刷新所有价格
              </el-button>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :xs="12" :sm="8" :md="6" v-for="symbol in store.config.symbols" :key="symbol">
              <div class="price-item">
                <div class="price-symbol">{{ symbol }}</div>
                <div class="price-value">{{ getCurrentPrice(symbol) }}</div>
                <div class="price-change" :class="getPriceChangeClass(symbol)">
                  {{ getPriceChange(symbol) }}
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 最近交易记录 -->
        <el-card shadow="hover" class="recent-trades-card">
          <template #header>
            <div class="card-header">
              <span>最近交易记录</span>
            </div>
          </template>
          <el-table :data="recentTrades" stripe style="width: 100%">
            <el-table-column prop="symbol" label="交易对" width="120" />
            <el-table-column label="类型" width="80">
              <template #default="{ row }">
                <el-tag :type="row.type === 'buy' ? 'success' : 'danger'" size="small">
                  {{ row.type === 'buy' ? '买入' : '卖出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="价格" width="120">
              <template #default="{ row }">
                {{ row.price?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="数量">
              <template #default="{ row }">
                {{ row.amount?.toFixed(5) }}
              </template>
            </el-table-column>
            <el-table-column label="时间" width="180">
              <template #default="{ row }">
                {{ new Date(row.timestamp).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
                  {{ row.status === 'completed' ? '已完成' : row.status === 'failed' ? '失败' : '进行中' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useTradingStore } from '../stores/trading'
import type { TradingSymbol } from '../../types/trading'

const store = useTradingStore()
const loadingBalance = ref(false)
const testing = ref(false)
const manualLoading = ref(false)

// 手动交易表单
const manualForm = ref({
  symbol: 'BTC/USDT' as any,
  price: 0,
  amount: 0,
})

// 最近交易记录
const recentTrades = ref<any[]>([])

// 价格变化记录
const priceHistory = ref<Record<string, number[]>>({})

// 定时器
let priceTimer: number | null = null

// 页面加载时初始化
onMounted(async () => {
  await refreshBalance()
  await refreshAllPrices()
  await loadRecentTrades()
  
  // 每60秒刷新一次价格
  priceTimer = window.setInterval(async () => {
    await refreshAllPrices()
  }, 60000)
})

// 页面卸载时清理
onUnmounted(() => {
  if (priceTimer) {
    clearInterval(priceTimer)
    priceTimer = null
  }
})

// 刷新余额
const refreshBalance = async () => {
  loadingBalance.value = true
  try {
    await store.fetchBalances()
  } catch (error) {
    console.error('刷新余额失败:', error)
  } finally {
    loadingBalance.value = false
  }
}

// 测试连接
const testConnection = async () => {
  testing.value = true
  try {
    const result = await store.testConnection()
    if (result.success) {
      ElMessage.success(result.message)
    } else {
      ElMessage.error(result.message)
    }
  } catch (error: any) {
    ElMessage.error('测试连接失败: ' + error.message)
  } finally {
    testing.value = false
  }
}

// 获取当前价格
const getSymbolPrices = async () => {
  try {
    const symbol = manualForm.value.symbol
    const response = await $fetch('/api/trading/current-price', {
      params: { symbol }
    }) as any
    
    if (response.success) {
      store.updateCurrentPrice(symbol, response.price)
      manualForm.value.price = response.price
      updatePriceHistory(symbol, response.price)
    }
  } catch (error) {
    console.error('刷新当前价格失败:', error)
  }
}

// 刷新所有价格
const refreshAllPrices = async () => {
  try {
    for (const symbol of store.config.symbols) {
      const response = await $fetch('/api/trading/current-price', {
        params: { symbol }
      }) as any
      
      if (response.success) {
        store.updateCurrentPrice(symbol, response.price)
        updatePriceHistory(symbol, response.price)
      }
    }
  } catch (error) {
    console.error('刷新所有价格失败:', error)
  }
}

// 更新价格历史
const updatePriceHistory = (symbol: string, price: number) => {
  if (!priceHistory.value[symbol]) {
    priceHistory.value[symbol] = []
  }
  priceHistory.value[symbol].push(price)
  // 只保留最近10个价格
  if (priceHistory.value[symbol].length > 10) {
    priceHistory.value[symbol] = priceHistory.value[symbol].slice(-10)
  }
}

// 获取当前价格
const getCurrentPrice = (symbol: string) => {
  const price = store.currentPrices[symbol as keyof typeof store.currentPrices]
  return price ? price.toFixed(2) : '0.00'
}

// 获取价格变化
const getPriceChange = (symbol: string) => {
  const history = priceHistory.value[symbol]
  if (!history || history.length < 2) return '0.00%'
  
  const current = history[history.length - 1] || 0
  const previous = history[history.length - 2] || 0
  const change = ((current - previous) / (previous || 1)) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
}

// 获取价格变化类名
const getPriceChangeClass = (symbol: string) => {
  const history = priceHistory.value[symbol]
  if (!history || history.length < 2) return 'neutral'
  
  const current = history[history.length - 1] || 0
  const previous = history[history.length - 2] || 0
  const change = current - previous
  
  if (change > 0) return 'positive'
  if (change < 0) return 'negative'
  return 'neutral'
}

// 手动买入
const handleManualBuy = async () => {
  if (!manualForm.value.price || !manualForm.value.amount) {
    ElMessage.warning('请输入价格和数量')
    return
  }
  
  manualLoading.value = true
  try {
    await store.manualBuy(manualForm.value.symbol, manualForm.value.price, manualForm.value.amount)
    ElMessage.success('买单提交成功')
    await loadRecentTrades()
    await refreshBalance()
  } catch (error: any) {
    ElMessage.error('买单提交失败: ' + error.message)
  } finally {
    manualLoading.value = false
  }
}

// 手动卖出
const handleManualSell = async () => {
  if (!manualForm.value.price || !manualForm.value.amount) {
    ElMessage.warning('请输入价格和数量')
    return
  }
  
  manualLoading.value = true
  try {
    await store.manualSell(manualForm.value.symbol, manualForm.value.price, manualForm.value.amount)
    ElMessage.success('卖单提交成功')
    await loadRecentTrades()
    await refreshBalance()
  } catch (error: any) {
    ElMessage.error('卖单提交失败: ' + error.message)
  } finally {
    manualLoading.value = false
  }
}

// 加载最近交易记录
const loadRecentTrades = async () => {
  try {
    // 从store中获取最近的交易记录
    const allTrades = [...store.tradeRecords]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 10)
    console.log(allTrades);
    
    recentTrades.value = allTrades.map(trade => ({
      symbol: trade.symbol,
      type: trade.buyPrice ? 'buy' : 'sell',
      price: trade.buyPrice || trade.sellPrice,
      amount: trade.amount,
      timestamp: trade.startTime,
      status: trade.status
    }))
  } catch (error) {
    console.error('加载交易记录失败:', error)
  }
}
</script>

<style scoped>
.manual-trading-container {
  min-height: calc(100vh - 70px); /* 减去底部导航高度 */
  background: #f5f7fa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .manual-trading-container {
    min-height: calc(100vh - 60px);
  }
}

@media (max-width: 480px) {
  .manual-trading-container {
    min-height: calc(100vh - 55px);
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .manual-trading-container {
    min-height: calc(100vh - 80px);
  }
}

.header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  flex-wrap: wrap;
  gap: 10px;
}

.header-content h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
  width: 100%;
}

.header-actions {
  font-size: 12px;
  float: right;
}

.main-content {
  padding: 20px;
}

/* 余额卡片 */
.balance-card {
  margin-bottom: 20px;
}

.balance-item {
  text-align: center;
  padding: 15px 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.balance-currency {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
  font-weight: bold;
}

.balance-amount {
  font-size: 18px;
  color: #303133;
  font-weight: bold;
}

/* 手动交易卡片 */
.manual-trading-card {
  margin-bottom: 20px;
}

/* 价格卡片 */
.price-card {
  margin-bottom: 20px;
}

.price-item {
  text-align: center;
  padding: 15px 10px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 10px;
}

.price-symbol {
  font-size: 14px;
  color: #909399;
  margin-bottom: 5px;
  font-weight: bold;
}

.price-value {
  font-size: 18px;
  color: #303133;
  font-weight: bold;
  margin-bottom: 5px;
}

.price-change {
  font-size: 12px;
  font-weight: bold;
}

.price-change.positive {
  color: #67c23a;
}

.price-change.negative {
  color: #f56c6c;
}

.price-change.neutral {
  color: #909399;
}

/* 最近交易卡片 */
.recent-trades-card {
  margin-bottom: 20px;
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
    padding: 10px 0;
  }
  
  .header-content h1 {
    font-size: 18px;
    width: 100%;
  }
  
  .main-content {
    padding: 10px;
  }
  
  /* 余额卡片移动端优化 */
  .balance-item {
    padding: 10px 5px;
    margin-bottom: 10px;
  }
  
  .balance-currency {
    font-size: 12px;
  }
  
  .balance-amount {
    font-size: 14px;
  }
  
  /* 价格卡片移动端优化 */
  .price-item {
    padding: 10px 5px;
    margin-bottom: 10px;
  }
  
  .price-symbol {
    font-size: 12px;
  }
  
  .price-value {
    font-size: 14px;
  }
  
  .price-change {
    font-size: 10px;
  }
  
  /* 卡片头部移动端优化 */
  .card-header {
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .card-header > div {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  
  .card-header :deep(.el-button) {
    margin: 0;
  }
  
  /* 表格移动端横向滚动 */
  .recent-trades-card :deep(.el-table) {
    font-size: 12px;
  }
  
  .recent-trades-card {
    overflow-x: auto;
  }
}

@media (max-width: 480px) {
  .header-content h1 {
    font-size: 16px;
  }
  
  .header-actions :deep(.el-switch__label) {
    font-size: 12px;
  }
  
  .balance-amount {
    font-size: 12px;
  }
  
  .price-value {
    font-size: 12px;
  }
  
  /* 小屏幕下隐藏部分表格列 */
  .recent-trades-card :deep(.el-table__body-wrapper) {
    overflow-x: scroll;
  }
}
</style>