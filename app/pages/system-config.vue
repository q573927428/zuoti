<template>
  <div class="system-config-container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>系统配置
            <span class="header-actions">
              <el-tag :type="store.config.isTestnet ? 'warning' : 'danger'" size="large">
                {{ store.config.isTestnet ? '模拟交易' : '真实交易' }}
              </el-tag>
            </span>
          </h1>
        </div>
      </el-header>

      <el-main class="main-content">
        <!-- 基本配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>基本配置</span>
              <el-switch
                v-model="store.config.isAutoTrading"
                active-text="开启"
                inactive-text="交易关闭"
                size="large"
                @change="handleAutoTradingChange"
              />
            </div>
          </template>
          <el-form :model="store.config" label-width="180px">
            <el-form-item label="使用模拟交易">
              <el-switch v-model="store.config.isTestnet" @change="handleConfigChange" />
              <span class="config-description">使用币安测试网进行模拟交易，不会产生真实资金损失</span>
            </el-form-item>
            
            <el-form-item label="自动交易开关">
              <el-switch v-model="store.config.isAutoTrading" @change="handleAutoTradingChange" />
              <span class="config-description">开启后系统会自动执行交易策略</span>
            </el-form-item>
            
            <el-form-item label="监控的交易对">
              <el-select
                v-model="store.config.symbols"
                multiple
                placeholder="选择交易对"
                style="width: 100%"
                @change="handleConfigChange"
              >
                <el-option label="ETH/USDT" value="ETH/USDT" />
                <el-option label="BTC/USDT" value="BTC/USDT" />
                <el-option label="BNB/USDT" value="BNB/USDT" />
                <el-option label="SOL/USDT" value="SOL/USDT" />
              </el-select>
              <span class="config-description">系统将监控这些交易对的振幅和趋势</span>
            </el-form-item>
            
            <el-form-item label="单次投资金额(USDT)">
              <el-input-number 
                v-model="store.config.investmentAmount" 
                :min="10" 
                :max="10000" 
                :step="10"
                @change="handleConfigChange"
              />
              <span class="config-description">每次交易的投入金额，建议20-100 USDT</span>
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
              <span class="config-description">价格振幅达到此阈值才会触发交易，建议2-5%</span>
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
              <span class="config-description">趋势强度超过此阈值会被过滤，避免追涨杀跌，建议3-8%</span>
            </el-form-item>
            
            <el-form-item label="每日交易次数限制">
              <el-input-number 
                v-model="store.config.dailyTradeLimit" 
                :min="0" 
                :max="100" 
                :step="1"
                @change="handleConfigChange"
              />
              <span class="config-description">0表示无限制，建议3-5次以控制风险</span>
            </el-form-item>
            
            <el-form-item label="交易间隔(分钟)">
              <el-input-number 
                v-model="tradeIntervalMinutes" 
                :min="0" 
                :max="1440" 
                :step="5"
                @change="handleTradeIntervalChange"
              />
              <span class="config-description">0表示无间隔，建议60-120分钟以避免频繁交易</span>
            </el-form-item>
            <el-form-item label="价格区间比例">
              <el-input-number 
                v-model="store.config.trading.priceRangeRatio" 
                :min="0.05" 
                :max="0.5" 
                :step="0.01"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">买入/卖出价格距离边界的比例，0.1表示10%</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 交易参数配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>交易参数配置</span>
            </div>
          </template>
          <el-form :model="store.config.trading" label-width="180px">
            <el-form-item label="价格偏离阈值(%)">
              <el-input-number 
                v-model="store.config.trading.priceDeviationThreshold" 
                :min="0.1" 
                :max="5" 
                :step="0.1"
                :precision="1"
                @change="handleConfigChange"
              />
              <span class="config-description">允许的价格偏离百分比，超过此值会调整订单价格</span>
            </el-form-item>
            
            <el-form-item label="部分成交判定阈值">
              <el-input-number 
                v-model="store.config.trading.partialFillThreshold" 
                :min="0.1" 
                :max="1" 
                :step="0.05"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">订单成交比例达到此值视为部分成交，0-1之间</span>
            </el-form-item>
            
            <el-form-item label="余额安全缓冲">
              <el-input-number 
                v-model="store.config.trading.balanceSafetyBuffer" 
                :min="0.01" 
                :max="0.5" 
                :step="0.01"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">保留的余额比例，防止余额不足，建议0.05-0.1</span>
            </el-form-item>
            
            <el-form-item label="市价单价格折扣">
              <el-input-number 
                v-model="store.config.trading.marketOrderDiscount" 
                :min="0.95" 
                :max="1" 
                :step="0.001"
                :precision="3"
                @change="handleConfigChange"
              />
              <span class="config-description">市价单相对于当前价格的折扣，0.999表示99.9%</span>
            </el-form-item>
            
          </el-form>
        </el-card>

        <!-- 订单超时配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>订单超时配置</span>
            </div>
          </template>
          <el-form :model="store.config.orderTimeout" label-width="180px">
            <el-form-item label="默认超时(分钟)">
              <el-input-number 
                v-model="orderTimeoutMinutes" 
                :min="1" 
                :max="240" 
                :step="5"
                @change="handleOrderTimeoutChange"
              />
              <span class="config-description">订单默认超时时间，超过此时间未成交会自动取消</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 熔断机制配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>熔断机制配置</span>
              <el-switch
                v-model="store.config.circuitBreaker.enabled"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-form :model="store.config.circuitBreaker" label-width="180px">
            <el-form-item label="启用熔断机制">
              <el-switch v-model="store.config.circuitBreaker.enabled" @change="handleConfigChange" />
              <span class="config-description">触发熔断条件后暂停交易，防止连续亏损</span>
            </el-form-item>
            
            <el-form-item label="连续失败次数阈值">
              <el-input-number 
                v-model="store.config.circuitBreaker.consecutiveFailures" 
                :min="1" 
                :max="20" 
                :step="1"
                @change="handleConfigChange"
              />
              <span class="config-description">连续失败多少次触发熔断，建议3-5次</span>
            </el-form-item>
            
            <el-form-item label="单日亏损限额(USDT)">
              <el-input-number 
                v-model="store.config.circuitBreaker.dailyLossLimit" 
                :min="1" 
                :max="500" 
                :step="5"
                @change="handleConfigChange"
              />
              <span class="config-description">当日亏损达到此限额触发熔断</span>
            </el-form-item>
            
            <el-form-item label="总亏损限额(USDT)">
              <el-input-number 
                v-model="store.config.circuitBreaker.totalLossLimit" 
                :min="10" 
                :max="2000" 
                :step="10"
                @change="handleConfigChange"
              />
              <span class="config-description">总亏损达到此限额触发熔断</span>
            </el-form-item>
            
            <el-form-item label="冷却时间(小时)">
              <el-input-number 
                v-model="circuitBreakerCooldownHours" 
                :min="1" 
                :max="48" 
                :step="1"
                @change="handleCircuitBreakerCooldownChange"
              />
              <span class="config-description">熔断后冷却时间，期间不进行交易</span>
            </el-form-item>
            
            <el-form-item label="价格波动阈值(%)">
              <el-input-number 
                v-model="store.config.circuitBreaker.priceVolatilityThreshold" 
                :min="1" 
                :max="50" 
                :step="1"
                @change="handleConfigChange"
              />
              <span class="config-description">价格波动超过此阈值可能触发熔断</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 止损配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>止损配置</span>
              <el-switch
                v-model="store.config.stopLoss.enabled"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-form :model="store.config.stopLoss" label-width="180px">
            <el-form-item label="启用止损">
              <el-switch v-model="store.config.stopLoss.enabled" @change="handleConfigChange" />
              <span class="config-description">亏损达到阈值时自动止损</span>
            </el-form-item>
            
            <el-form-item label="止损阈值(%)">
              <el-input-number 
                v-model="store.config.stopLoss.threshold" 
                :min="-20" 
                :max="-0.1" 
                :step="0.5"
                :precision="1"
                @change="handleConfigChange"
              />
              <span class="config-description">亏损达到此百分比时触发止损，负值</span>
            </el-form-item>
            
            <el-form-item label="执行价格折扣">
              <el-input-number 
                v-model="store.config.stopLoss.executionDiscount" 
                :min="0.95" 
                :max="1" 
                :step="0.001"
                :precision="3"
                @change="handleConfigChange"
              />
              <span class="config-description">止损单相对于当前价格的折扣</span>
            </el-form-item>
            
            <el-form-item label="等待确认时间(秒)">
              <el-input-number 
                v-model="stopLossWaitSeconds" 
                :min="1" 
                :max="60" 
                :step="1"
                @change="handleStopLossWaitTimeChange"
              />
              <span class="config-description">触发止损后等待确认的时间</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 多时间框架配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>多时间框架配置</span>
              <el-switch
                v-model="store.config.multiTimeframe.enabled"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-form :model="store.config.multiTimeframe" label-width="180px">
            <el-form-item label="启用多时间框架">
              <el-switch v-model="store.config.multiTimeframe.enabled" @change="handleConfigChange" />
              <span class="config-description">使用15m/1h/4h多个时间框架确认交易信号</span>
            </el-form-item>
            
            <el-form-item label="严格模式">
              <el-switch v-model="store.config.multiTimeframe.strictMode" @change="handleConfigChange" />
              <span class="config-description">开启后所有时间框架都要通过才交易</span>
            </el-form-item>
            
            <el-form-item label="15分钟权重">
              <el-input-number 
                v-model="store.config.multiTimeframe.weights['15m']" 
                :min="0" 
                :max="1" 
                :step="0.05"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">15分钟时间框架的权重，三个权重之和应为1</span>
            </el-form-item>
            
            <el-form-item label="1小时权重">
              <el-input-number 
                v-model="store.config.multiTimeframe.weights['1h']" 
                :min="0" 
                :max="1" 
                :step="0.05"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">1小时时间框架的权重</span>
            </el-form-item>
            
            <el-form-item label="4小时权重">
              <el-input-number 
                v-model="store.config.multiTimeframe.weights['4h']" 
                :min="0" 
                :max="1" 
                :step="0.05"
                :precision="2"
                @change="handleConfigChange"
              />
              <span class="config-description">4小时时间框架的权重</span>
            </el-form-item>
            
            <el-form-item label="评分阈值">
              <el-input-number 
                v-model="store.config.multiTimeframe.scoreThreshold" 
                :min="0" 
                :max="100" 
                :step="5"
                @change="handleConfigChange"
              />
              <span class="config-description">综合评分达到此阈值才交易，建议60-80</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- AI分析配置 -->
        <el-card shadow="hover" class="config-card">
          <template #header>
            <div class="card-header">
              <span>AI分析配置</span>
              <el-switch
                v-model="store.config.ai.enabled"
                @change="handleConfigChange"
              />
            </div>
          </template>
          <el-form :model="store.config.ai" label-width="180px">
            <el-form-item label="启用AI分析">
              <el-switch v-model="store.config.ai.enabled" @change="handleConfigChange" />
              <span class="config-description">使用AI分析市场情绪和交易建议</span>
            </el-form-item>
            
            <el-form-item label="分析间隔(分钟)">
              <el-input-number 
                v-model="aiAnalysisIntervalMinutes" 
                :min="1" 
                :max="60" 
                :step="1"
                @change="handleAIAnalysisIntervalChange"
              />
              <span class="config-description">AI分析的时间间隔</span>
            </el-form-item>
            
            <el-form-item label="最小置信度">
              <el-input-number 
                v-model="store.config.ai.minConfidence" 
                :min="0" 
                :max="100" 
                :step="5"
                @change="handleConfigChange"
              />
              <span class="config-description">AI分析置信度达到此值才采纳建议</span>
            </el-form-item>
            
            <el-form-item label="最大风险等级">
              <el-select v-model="store.config.ai.maxRiskLevel" @change="handleConfigChange">
                <el-option label="低风险" value="LOW" />
                <el-option label="中风险" value="MEDIUM" />
                <el-option label="高风险" value="HIGH" />
              </el-select>
              <span class="config-description">只采纳此风险等级以下的AI建议</span>
            </el-form-item>
            
            <el-form-item label="用于买入决策">
              <el-switch v-model="store.config.ai.useForBuyDecisions" @change="handleConfigChange" />
              <span class="config-description">是否使用AI分析结果进行买入决策</span>
            </el-form-item>
            
            <el-form-item label="用于卖出决策">
              <el-switch v-model="store.config.ai.useForSellDecisions" @change="handleConfigChange" />
              <span class="config-description">是否使用AI分析结果进行卖出决策</span>
            </el-form-item>
            
            <el-form-item label="缓存时间(分钟)">
              <el-input-number 
                v-model="aiCacheDurationMinutes" 
                :min="1" 
                :max="60" 
                :step="1"
                @change="handleAICacheDurationChange"
              />
              <span class="config-description">AI分析结果的缓存时间</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 配置保存按钮 -->
        <div class="action-buttons">
          <el-button type="primary" size="large" @click="saveConfig" :loading="saving">
            保存配置
          </el-button>
          <el-button type="default" size="large" @click="resetToDefaults">
            恢复默认
          </el-button>
        </div>

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
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useTradingStore } from '../stores/trading'

const store = useTradingStore()
const saving = ref(false)

// 交易间隔分钟数（用于显示和输入）
const tradeIntervalMinutes = computed({
  get: () => Math.round(store.config.tradeInterval / 1000 / 60),
  set: (minutes) => {
    store.config.tradeInterval = minutes * 60 * 1000
  }
})

// 订单超时分钟数（用于显示和输入）
const orderTimeoutMinutes = computed({
  get: () => Math.round(store.config.orderTimeout.default / 1000 / 60),
  set: (minutes) => {
    store.config.orderTimeout.default = minutes * 60 * 1000
  }
})

// 熔断器冷却时间小时数（用于显示和输入）
const circuitBreakerCooldownHours = computed({
  get: () => Math.round(store.config.circuitBreaker.cooldownPeriod / 1000 / 60 / 60),
  set: (hours) => {
    store.config.circuitBreaker.cooldownPeriod = hours * 60 * 60 * 1000
  }
})

// 止损等待时间秒数（用于显示和输入）
const stopLossWaitSeconds = computed({
  get: () => Math.round(store.config.stopLoss.waitTime / 1000),
  set: (seconds) => {
    store.config.stopLoss.waitTime = seconds * 1000
  }
})

// AI分析间隔分钟数（用于显示和输入）
const aiAnalysisIntervalMinutes = computed({
  get: () => Math.round(store.config.ai.analysisInterval / 1000 / 60),
  set: (minutes) => {
    store.config.ai.analysisInterval = minutes * 60 * 1000
  }
})

// AI缓存时间分钟数（用于显示和输入）
const aiCacheDurationMinutes = computed({
  get: () => Math.round(store.config.ai.cacheDuration / 1000 / 60),
  set: (minutes) => {
    store.config.ai.cacheDuration = minutes * 60 * 1000
  }
})

// 处理交易间隔变化
const handleTradeIntervalChange = async () => {
  await handleConfigChange()
}

// 处理订单超时变化
const handleOrderTimeoutChange = async () => {
  await handleConfigChange()
}

// 处理熔断器冷却时间变化
const handleCircuitBreakerCooldownChange = async () => {
  await handleConfigChange()
}

// 处理止损等待时间变化
const handleStopLossWaitTimeChange = async () => {
  await handleConfigChange()
}

// 处理AI分析间隔变化
const handleAIAnalysisIntervalChange = async () => {
  await handleConfigChange()
}

// 处理AI缓存时间变化
const handleAICacheDurationChange = async () => {
  await handleConfigChange()
}

// 处理自动交易开关变化
const handleAutoTradingChange = async () => {
  try {
    await store.toggleAutoTrading(store.config.isAutoTrading)
    ElMessage.success(`自动交易已${store.config.isAutoTrading ? '开启' : '关闭'}`)
  } catch (error: any) {
    ElMessage.error('切换自动交易失败: ' + error.message)
    // 切换失败，恢复状态
    store.config.isAutoTrading = !store.config.isAutoTrading
  }
}

// 处理配置变化
const handleConfigChange = async () => {
  await store.savePersistedData()
  ElMessage.success('配置已保存')
}

// 保存配置
const saveConfig = async () => {
  saving.value = true
  try {
    await store.savePersistedData()
    ElMessage.success('配置保存成功')
  } catch (error: any) {
    ElMessage.error('保存配置失败: ' + error.message)
  } finally {
    saving.value = false
  }
}

// 恢复默认配置
const resetToDefaults = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要恢复默认配置吗？这将重置所有配置项。',
      '确认恢复默认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    // 恢复默认配置
    store.config = {
      isTestnet: false,
      isAutoTrading: false,
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'],
      investmentAmount: 20,
      amplitudeThreshold: 3,
      trendThreshold: 5.0,
      orderTimeout: {
        default: 120 * 60 * 1000,
      },
      circuitBreaker: {
        enabled: true,
        consecutiveFailures: 5,
        dailyLossLimit: 20,
        totalLossLimit: 100,
        cooldownPeriod: 12 * 60 * 60 * 1000,
        priceVolatilityThreshold: 10,
      },
      dailyReset: {
        processingTime: '23:00',
        warningTime: '23:30',
        forceLiquidationDiscount: 0.999,
      },
      stopLoss: {
        enabled: true,
        threshold: -2,
        executionDiscount: 0.998,
        waitTime: 5 * 1000,
      },
      trading: {
        priceDeviationThreshold: 0.5,
        partialFillThreshold: 0.9,
        balanceSafetyBuffer: 0.05,
        marketOrderDiscount: 0.999,
        priceRangeRatio: 0.1
      },
      multiTimeframe: {
        enabled: true,
        strictMode: false,
        weights: {
          '15m': 0.4,
          '1h': 0.35,
          '4h': 0.25
        },
        scoreThreshold: 70,
        lookbackPeriods: {
          '15m': 48,
          '1h': 24,
          '4h': 12
        }
      },
      dailyTradeLimit: 3,
      tradeInterval: 60 * 60 * 1000,
      ai: {
        enabled: true,
        analysisInterval: 10 * 60 * 1000,
        minConfidence: 70,
        maxRiskLevel: 'MEDIUM',
        useForBuyDecisions: true,
        useForSellDecisions: true,
        cacheDuration: 5 * 60 * 1000,
      },
    }
    
    await store.savePersistedData()
    ElMessage.success('已恢复默认配置')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('恢复默认配置失败: ' + error.message)
    }
  }
}

// 页面加载时加载配置
onMounted(async () => {
  await store.loadPersistedData()
})
</script>

<style scoped>
.system-config-container {
  min-height: calc(100vh - 70px);
  background: #f5f7fa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .system-config-container {
    min-height: calc(100vh - 60px);
  }
}

@media (max-width: 480px) {
  .system-config-container {
    min-height: calc(100vh - 55px);
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .system-config-container {
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
  
  /* 系统配置表单移动端优化 */
  .config-card :deep(.el-form-item__label) {
    width: 120px !important;
    font-size: 14px;
  }
  
  /* 日志卡片移动端优化 */
  .debug-logs {
    max-height: 300px;
  }
  
  .log-item {
    font-size: 11px;
    padding: 6px;
  }
}

@media (max-width: 480px) {
  .header-content h1 {
    font-size: 16px;
  }
  
  .header-actions :deep(.el-switch__label) {
    font-size: 12px;
  }
}

.config-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.config-description {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.4;
}

.action-buttons {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  justify-content: center;
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
