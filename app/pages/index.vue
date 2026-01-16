<template>
  <div class="trading-container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>币安自动做T交易系统</h1>
          <div class="header-actions">
            <el-tag :type="store.config.isTestnet ? 'warning' : 'danger'" size="large">
              {{ store.config.isTestnet ? '模拟交易' : '真实交易' }}
            </el-tag>
            <el-switch
              v-model="store.config.isAutoTrading"
              active-text="自动交易开启"
              inactive-text="自动交易关闭"
              size="large"
              @change="handleAutoTradingChange"
            />
          </div>
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
            <el-col :span="4" v-for="currency in ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL']" :key="currency">
              <div class="balance-item">
                <div class="balance-currency">{{ currency }}</div>
                <div class="balance-amount">{{ (store.balances[currency]?.free || 0).toFixed(currency === 'USDT' || currency === 'USDC' ? 2 : 8) }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 统计卡片 -->
        <el-row :gutter="20" class="stats-row">
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">总交易次数</div>
                <div class="stat-value">{{ store.stats.totalTrades }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">成功交易</div>
                <div class="stat-value success">{{ store.stats.successfulTrades }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">总收益 (USDT)</div>
                <div class="stat-value" :class="store.stats.totalProfit >= 0 ? 'success' : 'danger'">
                  {{ store.stats.totalProfit >= 0 ? '+' : '' }}{{ store.stats.totalProfit.toFixed(2) }}
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">年化收益率</div>
                <div class="stat-value" :class="store.stats.annualizedReturn >= 0 ? 'success' : 'danger'">
                  {{ store.stats.annualizedReturn >= 0 ? '+' : '' }}{{ store.stats.annualizedReturn.toFixed(2) }}%
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 交易状态 -->
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>交易状态</span>
              <el-tag :type="getStateType(store.tradingStatus.state)" size="large">
                {{ getStateText(store.tradingStatus.state) }}
              </el-tag>
            </div>
          </template>
          <div v-if="store.tradingStatus.symbol" class="status-content">
            <el-descriptions :column="3" border>
              <el-descriptions-item label="交易对">{{ store.tradingStatus.symbol }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ getStateText(store.tradingStatus.state) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ new Date(store.tradingStatus.lastUpdateTime).toLocaleString() }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.buyOrder" label="买单价格">
                {{ store.tradingStatus.buyOrder.price }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.buyOrder" label="买单数量">
                {{ store.tradingStatus.buyOrder.amount }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.sellOrder" label="卖单价格">
                {{ store.tradingStatus.sellOrder.price }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
          <div v-else class="empty-status">
            <el-empty description="暂无进行中的交易" />
          </div>
        </el-card>

        <!-- 振幅分析 -->
        <el-card shadow="hover" class="analysis-card">
          <template #header>
            <div class="card-header">
              <span>实时振幅分析</span>
              <el-button type="primary" size="small" @click="refreshAnalysis" :loading="loading">
                刷新分析
              </el-button>
            </div>
          </template>
          <el-table :data="store.amplitudeAnalyses" stripe style="width: 100%">
            <el-table-column prop="symbol" label="交易对" width="100" />
            <el-table-column label="当前价格">
              <template #default="{ row }">
                <span style="font-weight: bold; color: #409eff;">
                  {{ getCurrentPrice(row.symbol) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="振幅">
              <template #default="{ row }">
                <el-tag :type="row.amplitude >= store.config.amplitudeThreshold ? 'success' : 'info'" size="small">
                  {{ row.amplitude }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="趋势">
              <template #default="{ row }">
                <el-tag :type="row.trend > 0 ? 'success' : row.trend < 0 ? 'danger' : 'info'" size="small">
                  {{ row.trend > 0 ? '+' : '' }}{{ row.trend }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="趋势过滤">
              <template #default="{ row }">
                <el-tag :type="row.isTrendFiltered ? 'warning' : 'success'" size="small">
                  {{ row.isTrendFiltered ? '已过滤' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="high" label="最高价" />
            <el-table-column prop="low" label="最低价" />
            <el-table-column prop="buyPrice" label="建议买入价" />
            <el-table-column prop="sellPrice" label="建议卖出价" />
            <el-table-column label="今日交易">
              <template #default="{ row }">
                <el-tag :type="(store.stats.tradedSymbols[row.symbol] ?? 0) > 0 ? 'info' : 'success'" size="small">
                  {{ store.stats.tradedSymbols[row.symbol] ?? 0 }}次
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 交易记录 -->
        <el-card shadow="hover" class="records-card">
          <template #header>
            <div class="card-header">
              <span>交易记录（今日）</span>
            </div>
          </template>
          <el-table :data="store.todayTrades" stripe style="width: 100%">
            <el-table-column prop="symbol" label="交易对" width="120" />
            <el-table-column label="买入价" width="120">
              <template #default="{ row }">
                {{ row.buyPrice?.toFixed(8) }}
              </template>
            </el-table-column>
            <el-table-column label="卖出价">
              <template #default="{ row }">
                {{ row.sellPrice?.toFixed(8) || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="数量">
              <template #default="{ row }">
                {{ row.amount?.toFixed(8) }}
              </template>
            </el-table-column>
            <el-table-column label="收益(USDT)">
              <template #default="{ row }">
                <span :class="row.profit >= 0 ? 'text-success' : 'text-danger'">
                  {{ row.profit ? (row.profit >= 0 ? '+' : '') + row.profit.toFixed(2) : '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="收益率">
              <template #default="{ row }">
                <span :class="row.profitRate >= 0 ? 'text-success' : 'text-danger'">
                  {{ row.profitRate ? (row.profitRate >= 0 ? '+' : '') + row.profitRate.toFixed(2) + '%' : '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="状态">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">
                  {{ row.status === 'completed' ? '已完成' : row.status === 'failed' ? '失败' : '进行中' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="180">
              <template #default="{ row }">
                {{ new Date(row.startTime).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="结束时间" width="180">
              <template #default="{ row }">
                {{ row.endTime ? new Date(row.endTime).toLocaleString() : '-' }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 手动交易面板 -->
        <el-card shadow="hover" class="manual-trading-card">
          <template #header>
            <div class="card-header">
              <span>手动交易</span>
            </div>
          </template>
          <el-form :model="manualForm" label-width="120px">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="交易对">
                  <el-select v-model="manualForm.symbol" placeholder="选择交易对">
                    <el-option
                      v-for="symbol in store.config.symbols"
                      :key="symbol"
                      :label="symbol"
                      :value="symbol"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="价格">
                  <el-input-number v-model="manualForm.price" :min="0" :precision="8" style="width: 100%"/>
                </el-form-item>
                <el-form-item label="数量">
                  <el-input-number v-model="manualForm.amount" :min="0" :precision="8" style="width: 100%"/>
                </el-form-item>
                <el-form-item>
                  <el-button type="success" @click="handleManualBuy" :loading="manualLoading">
                    手动买入
                  </el-button>
                  <el-button type="danger" @click="handleManualSell" :loading="manualLoading">
                    手动卖出
                  </el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <!-- 调试日志 -->
        <el-card shadow="hover" class="debug-log-card">
          <template #header>
            <div class="card-header">
              <span>调试日志</span>
              <el-button type="danger" size="small" @click="store.clearDebugLogs()">
                清空日志
              </el-button>
            </div>
          </template>
          <div class="debug-logs">
            <div v-if="store.debugLogs.length === 0" class="empty-logs">
              <el-empty description="暂无日志" />
            </div>
            <div v-else class="log-list">
              <div v-for="(log, index) in store.debugLogs" :key="index" class="log-item">
                {{ log }}
              </div>
            </div>
          </div>
        </el-card>

        <!-- 系统配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>系统配置</span>
            </div>
          </template>
          <el-form :model="store.config" label-width="150px">
            <el-form-item label="使用模拟交易">
              <el-switch v-model="store.config.isTestnet" @change="handleConfigChange" />
            </el-form-item>
            <el-form-item label="投资金额(USDT)">
              <el-input-number 
                v-model="store.config.investmentAmount" 
                :min="10" 
                :max="10000" 
                :step="10"
                @change="handleConfigChange"
              />
            </el-form-item>
            <el-form-item label="振幅阈值(%)">
              <el-input-number 
                v-model="store.config.amplitudeThreshold" 
                :min="0.1" 
                :max="20" 
                :step="0.1"
                :precision="1"
                @change="handleConfigChange"
              />
            </el-form-item>
            <el-form-item label="趋势过滤阈值(%)">
              <el-input-number 
                v-model="store.config.trendThreshold" 
                :min="0.1" 
                :max="20" 
                :step="0.1"
                :precision="1"
                @change="handleConfigChange"
              />
            </el-form-item>
          </el-form>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useTradingStore } from '../stores/trading'

const store = useTradingStore()
const loading = ref(false)
const testing = ref(false)
const loadingBalance = ref(false)
const manualLoading = ref(false)

// 手动交易表单
const manualForm = ref({
  symbol: 'BTC/USDT' as any,
  price: 0,
  amount: 0,
})

// 页面加载时初始化
onMounted(async () => {
  await store.loadPersistedData()
  await refreshBalance()
  await refreshAnalysis()
  
  // 定时刷新数据
  setInterval(async () => {
    await refreshAnalysis()
    await refreshBalance()
  }, 60000) // 每分钟刷新一次
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
  } catch (error: any) {
    ElMessage.error('卖单提交失败: ' + error.message)
  } finally {
    manualLoading.value = false
  }
}

// 刷新振幅分析
const refreshAnalysis = async () => {
  loading.value = true
  try {
    const result = await $fetch('/api/trading/analyze', {
      params: {
        symbols: store.config.symbols.join(','),
        amplitudeThreshold: store.config.amplitudeThreshold,
        trendThreshold: store.config.trendThreshold,
        tradedSymbols: JSON.stringify(store.stats.tradedSymbols),
      }
    }) as any
    
    store.updateAmplitudeAnalyses(result.allAnalyses)
    
    // 同时获取当前价格
    await refreshCurrentPrices()
  } catch (error) {
    console.error('刷新振幅分析失败:', error)
  } finally {
    loading.value = false
  }
}

// 刷新当前价格
const refreshCurrentPrices = async () => {
  try {
    for (const symbol of store.config.symbols) {
      const response = await $fetch('/api/trading/current-price', {
        params: { symbol }
      }) as any
      
      if (response.success) {
        store.updateCurrentPrice(symbol, response.price)
      }
    }
  } catch (error) {
    console.error('刷新当前价格失败:', error)
  }
}

// 处理自动交易开关变化
const handleAutoTradingChange = async () => {
  await store.savePersistedData()
}

// 处理配置变化
const handleConfigChange = async () => {
  await store.savePersistedData()
  await refreshAnalysis()
}

// 获取状态类型
const getStateType = (state: string) => {
  const typeMap: Record<string, any> = {
    'IDLE': 'info',
    'BUY_ORDER_PLACED': 'warning',
    'BOUGHT': 'primary',
    'SELL_ORDER_PLACED': 'warning',
    'DONE': 'success',
  }
  return typeMap[state] || 'info'
}

// 获取状态文本
const getStateText = (state: string) => {
  const textMap: Record<string, string> = {
    'IDLE': '空闲',
    'BUY_ORDER_PLACED': '买单已挂',
    'BOUGHT': '已买入',
    'SELL_ORDER_PLACED': '卖单已挂',
    'DONE': '已完成',
  }
  return textMap[state] || state
}

// 获取当前价格
const getCurrentPrice = (symbol: string) => {
  const price = store.currentPrices[symbol as keyof typeof store.currentPrices]
  return price ? price.toFixed(2) : '0.00'
}
</script>

<style scoped>
.trading-container {
  min-height: 100vh;
  background: #f5f7fa;
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
}

.header-content h1 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 20px;
  align-items: center;
}

.main-content {
  padding: 20px;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
}

.stat-item {
  padding: 10px 0;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-value.success {
  color: #67c23a;
}

.stat-value.danger {
  color: #f56c6c;
}

.status-card,
.analysis-card,
.records-card,
.config-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.status-content {
  padding: 10px 0;
}

.empty-status {
  padding: 20px 0;
}

.text-success {
  color: #67c23a;
  font-weight: bold;
}

.text-danger {
  color: #f56c6c;
  font-weight: bold;
}

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

.manual-trading-card {
  margin-bottom: 20px;
}

.debug-log-card {
  margin-bottom: 20px;
}

.debug-logs {
  max-height: 400px;
  overflow-y: auto;
}

.log-list {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.log-item {
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
  color: #606266;
  line-height: 1.5;
}

.log-item:hover {
  background: #f5f7fa;
}

.empty-logs {
  padding: 40px 0;
}
</style>
