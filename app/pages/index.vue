<template>
  <div class="trading-container">
    <el-container>
      <!-- 头部 -->
      <el-header class="header">
        <div class="header-content">
          <h1>自动做T系统
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
            <el-col :xs="12" :sm="6" :md="3" v-for="currency in ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE']" :key="currency">
              <div class="balance-item">
                <div class="balance-currency">{{ currency }}</div>
                <div class="balance-amount">{{ (store.balances[currency]?.free || 0).toFixed(currency === 'USDT' || currency === 'USDC' ? 2 : 5) }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 统计卡片 -->
        <el-row :gutter="20" class="stats-row">
          <el-col :xs="12" :sm="12" :md="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">总交易次数</div>
                <div class="stat-value">{{ store.stats.totalTrades }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">成功交易</div>
                <div class="stat-value success">{{ store.stats.successfulTrades }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-item">
                <div class="stat-label">总收益 (USDT)</div>
                <div class="stat-value" :class="store.stats.totalProfit >= 0 ? 'success' : 'danger'">
                  {{ store.stats.totalProfit >= 0 ? '+' : '' }}{{ store.stats.totalProfit.toFixed(2) }}
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
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

        <!-- 熔断器状态 -->
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>熔断器状态</span>
              <div>
                <el-tag 
                  :type="store.circuitBreakerState.isTripped ? 'danger' : 'success'" 
                  size="large"
                >
                  {{ store.circuitBreakerState.isTripped ? '🔒 已熔断' : '✅ 正常' }}
                </el-tag>
                <el-button 
                  v-if="store.circuitBreakerState.isTripped"
                  type="warning" 
                  size="small" 
                  @click="handleResetCircuitBreaker"
                  :loading="resettingCircuitBreaker"
                >
                  重置熔断器
                </el-button>
              </div>
            </div>
          </template>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="连续失败次数">
              <el-tag :type="store.circuitBreakerState.consecutiveFailures > 0 ? 'warning' : 'success'">
                {{ store.circuitBreakerState.consecutiveFailures }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="当日亏损(USDT)">
              <span :class="store.circuitBreakerState.dailyLoss < 0 ? 'text-danger' : 'text-success'">
                {{ store.circuitBreakerState.dailyLoss.toFixed(2) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="熔断限额">
              连续失败: {{ store.config.circuitBreaker.consecutiveFailures }}次<br/>
              日亏损: {{ store.config.circuitBreaker.dailyLossLimit }} USDT
            </el-descriptions-item>
            <el-descriptions-item v-if="store.circuitBreakerState.isTripped && store.circuitBreakerState.trippedAt" label="熔断时间" :span="2">
              {{ new Date(store.circuitBreakerState.trippedAt).toLocaleString() }}
            </el-descriptions-item>
            <el-descriptions-item v-if="store.circuitBreakerState.reason" label="熔断原因" :span="3">
              <el-tag type="danger">{{ store.circuitBreakerState.reason }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 交易状态 -->
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>交易状态（全部）</span>
              <el-tag :type="getStateType(store.tradingStatus.state)" size="large">
                {{ getStateText(store.tradingStatus.state) }}
              </el-tag>
            </div>
          </template>
          <div class="status-content">
            <el-descriptions :column="3" border>
              <el-descriptions-item label="今日交易">
                <el-tag :type="getTodayCompletedTrades() >= store.config.dailyTradeLimit && store.config.dailyTradeLimit > 0 ? 'danger' : 'success'">
                  {{ getTodayCompletedTrades() }}/{{ store.config.dailyTradeLimit || '无限制' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="交易间隔状态" :span="2">
                <el-tag :type="getTradeIntervalStatus().includes('可立即') ? 'success' : 'warning'">
                  {{ getTradeIntervalStatus() }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="交易对">{{ store.tradingStatus.symbol || '无' }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ getStateText(store.tradingStatus.state) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ new Date(store.tradingStatus.lastUpdateTime).toLocaleString() }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.buyOrder" label="买单价格">
                {{ store.tradingStatus.buyOrder.price }}
                <div style="font-size: 12px; color: #909399;">
                  ({{ getCurrentPrice(store.tradingStatus.symbol || '') }})
                </div>
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.buyOrder" label="买单数量">
                {{ store.tradingStatus.buyOrder.amount }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.buyOrder" label="买单状态">
                <el-tag :type="store.tradingStatus.buyOrder.status === 'closed' ? 'success' : store.tradingStatus.buyOrder.status === 'canceled' ? 'danger' : 'warning'" style="margin-right: 10px;">
                  {{ store.tradingStatus.buyOrder.status === 'closed' ? '已成交' : store.tradingStatus.buyOrder.status === 'canceled' ? '已取消' : '进行中' }}
                </el-tag>
                <el-button
                  v-if="store.tradingStatus.state === 'BUY_ORDER_PLACED' && store.tradingStatus.buyOrder"
                  type="primary" 
                  size="small"
                  @click="handleMarketBuyFromStatus"
                  :loading="marketBuying"
                >
                  市价买入
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.sellOrder" label="卖单价格">
                {{ store.tradingStatus.sellOrder.price }} (<span :class="unrealizedProfit >= 0 ? 'text-success' : 'text-danger'"> {{ unrealizedProfit >= 0 ? '+' : '' }}{{ unrealizedProfit.toFixed(2) }} U </span>)
                <div style="font-size: 12px; color: #909399;">
                  ({{ unrealizedProfitRate >= 0 ? '+' : '' }}{{ unrealizedProfitRate.toFixed(2) }}%)
                </div>
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.sellOrder" label="卖单数量">
                {{ store.tradingStatus.sellOrder.amount }}
              </el-descriptions-item>
              <el-descriptions-item v-if="store.tradingStatus.sellOrder" label="卖单状态">
                <el-tag :type="store.tradingStatus.sellOrder.status === 'closed' ? 'success' : store.tradingStatus.sellOrder.status === 'canceled' ? 'danger' : 'warning'" style="margin-right: 10px;">
                  {{ store.tradingStatus.sellOrder.status === 'closed' ? '已成交' : store.tradingStatus.sellOrder.status === 'canceled' ? '已取消' : '进行中' }}
                </el-tag>
                <el-button
                  v-if="store.tradingStatus.buyOrder && (store.tradingStatus.state === 'BOUGHT' || store.tradingStatus.state === 'SELL_ORDER_PLACED')"
                  type="danger"
                  size="small"
                  :loading="marketSelling"
                  @click="handleMarketSellFromStatus"
                >
                  市价卖出
                </el-button>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-card>

        <!-- 振幅分析 -->
        <el-card shadow="hover" class="analysis-card">
          <template #header>
            <div class="card-header">
              <span>实时振幅分析</span>
              <div>
                <el-button type="primary" size="small" @click="refreshAnalysis" :loading="loading">
                  刷新分析
                </el-button>
              </div>
            </div>
          </template>
          <el-table :data="store.amplitudeAnalyses" stripe style="width: 100%">
            <el-table-column prop="symbol" label="交易对" width="100" fixed />
            
            <el-table-column label="当前价格">
              <template #default="{ row }">
                <span style="font-weight: bold; color: #409eff;">
                  {{ getCurrentPrice(row.symbol) }}
                </span>
              </template>
            </el-table-column>
            
            <!-- 如果启用多时间框架，显示多时间框架趋势 -->
            <el-table-column v-if="store.config.multiTimeframe?.enabled" label="多时间框架分析" width="280">
              <template #default="{ row }">
                <div v-if="row.timeframes" style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: #909399; width: 38px; font-weight: bold;">15m:</span>
                    <div style="flex: 1; display: flex; gap: 2px;">
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">振幅:</span>
                        <el-tag :type="getAmplitudeType(row.timeframes['15m']?.amplitude)" size="small">
                          {{ formatAmplitude(row.timeframes['15m']?.amplitude) }}
                        </el-tag>
                      </div>
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">趋势:</span>
                        <el-tag :type="getTrendType(row.timeframes['15m']?.trend)" size="small">
                          {{ formatTrend(row.timeframes['15m']?.trend) }}
                        </el-tag>
                      </div>
                    </div>
                    <span v-if="isTimeframePassed(row.timeframes['15m'])" style="color: #67c23a; font-size: 14px;">✓</span>
                    <span v-else style="color: #f56c6c; font-size: 14px;">✗</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: #909399; width: 38px; font-weight: bold;">1h:</span>
                    <div style="flex: 1; display: flex; gap: 2px;">
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">振幅:</span>
                        <el-tag :type="getAmplitudeType(row.timeframes['1h']?.amplitude)" size="small">
                          {{ formatAmplitude(row.timeframes['1h']?.amplitude) }}
                        </el-tag>
                      </div>
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">趋势:</span>
                        <el-tag :type="getTrendType(row.timeframes['1h']?.trend)" size="small">
                          {{ formatTrend(row.timeframes['1h']?.trend) }}
                        </el-tag>
                      </div>
                    </div>
                    <span v-if="isTimeframePassed(row.timeframes['1h'])" style="color: #67c23a; font-size: 14px;">✓</span>
                    <span v-else style="color: #f56c6c; font-size: 14px;">✗</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: #909399; width: 38px; font-weight: bold;">4h:</span>
                    <div style="flex: 1; display: flex; gap: 2px;">
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">振幅:</span>
                        <el-tag :type="getAmplitudeType(row.timeframes['4h']?.amplitude)" size="small">
                          {{ formatAmplitude(row.timeframes['4h']?.amplitude) }}
                        </el-tag>
                      </div>
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="color: #606266; font-size: 10px;">趋势:</span>
                        <el-tag :type="getTrendType(row.timeframes['4h']?.trend)" size="small">
                          {{ formatTrend(row.timeframes['4h']?.trend) }}
                        </el-tag>
                      </div>
                    </div>
                    <span v-if="isTimeframePassed(row.timeframes['4h'])" style="color: #67c23a; font-size: 14px;">✓</span>
                    <span v-else style="color: #f56c6c; font-size: 14px;">✗</span>
                  </div>
                </div>
                <span v-else style="color: #909399;">-</span>
              </template>
            </el-table-column>
            
            <!-- 如果启用多时间框架，显示评分 -->
            <el-table-column v-if="store.config.multiTimeframe?.enabled" label="评分" width="150" >
              <template #default="{ row }">
                <div v-if="row.score !== undefined">
                  <el-progress 
                    :percentage="row.score" 
                    :color="getScoreColor(row.score)"
                    :stroke-width="16"
                  >
                    <span style="font-size: 12px; font-weight: bold;">
                      {{ row.score }}
                    </span>
                  </el-progress>
                </div>
                <span v-else style="color: #909399;">-</span>
              </template>
            </el-table-column>
            
            <!-- 如果启用多时间框架，显示确认状态 -->
            <el-table-column v-if="store.config.multiTimeframe?.enabled" label="确认状态">
              <template #default="{ row }">
                <el-tooltip
                  v-if="row.isValid !== undefined"
                  :content="getConfirmationStatus(row).tooltip"
                  placement="top"
                >
                  <el-tag 
                    :type="getConfirmationStatus(row).type" 
                    size="small"
                  >
                    {{ getConfirmationStatus(row).text }}
                  </el-tag>
                </el-tooltip>
                <span v-else style="color: #909399;">-</span>
              </template>
            </el-table-column>
            
            <!-- 单时间框架时显示 -->
            <el-table-column v-if="!store.config.multiTimeframe?.enabled" label="振幅">
              <template #default="{ row }">
                <el-tag :type="row.amplitude >= store.config.amplitudeThreshold ? 'success' : 'info'" size="small">
                  {{ row.amplitude }}%
                </el-tag>
              </template>
            </el-table-column>
            
            <el-table-column v-if="!store.config.multiTimeframe?.enabled" label="趋势" >
              <template #default="{ row }">
                <el-tag :type="row.trend > 0 ? 'success' : row.trend < 0 ? 'danger' : 'info'" size="small">
                  {{ row.trend > 0 ? '+' : '' }}{{ row.trend }}%
                </el-tag>
              </template>
            </el-table-column>
            
            <el-table-column v-if="!store.config.multiTimeframe?.enabled" label="趋势过滤" width="90">
              <template #default="{ row }">
                <el-tag :type="row.isTrendFiltered ? 'warning' : 'success'" size="small">
                  {{ row.isTrendFiltered ? '已过滤' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            
            <!-- 最高价 - 兼容多时间框架 -->
            <el-table-column label="最高价">
              <template #default="{ row }">
                {{ row.timeframes ? row.timeframes['15m'].high : row.high }}
              </template>
            </el-table-column>

            <!-- 最低价 - 兼容多时间框架 -->
            <el-table-column label="最低价">
              <template #default="{ row }">
                {{ row.timeframes ? row.timeframes['15m'].low : row.low }}
              </template>
            </el-table-column>

            <!-- 建议买入价 - 兼容多时间框架 -->
            <el-table-column label="建议买入价">
              <template #default="{ row }">
                {{ row.timeframes ? row.timeframes['15m'].buyPrice : row.buyPrice }}
              </template>
            </el-table-column>

            <!-- 建议卖出价 - 兼容多时间框架 -->
            <el-table-column label="建议卖出价">
              <template #default="{ row }">
                {{ row.timeframes ? row.timeframes['15m'].sellPrice : row.sellPrice }}
              </template>
            </el-table-column>

            
            <el-table-column label="今日交易" width="80">
              <template #default="{ row }">
                <el-tag :type="(store.stats.tradedSymbols[row.symbol] ?? 0) > 0 ? 'info' : 'success'" size="small">
                  {{ store.stats.tradedSymbols[row.symbol] ?? 0 }}次
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- AI分析结果 -->
        <el-card shadow="hover" class="ai-analysis-card">
          <template #header>
            <div class="card-header">
              <span>🤖 AI智能分析</span>
              <div>
                <el-select v-model="selectedAISymbol" placeholder="选择交易对" size="small" style="width: 120px;">
                  <el-option v-for="symbol in store.config.symbols" :key="symbol" :label="symbol" :value="symbol" />
                </el-select>
                <el-button type="success" size="small" @click="testAIAnalysis" :loading="testingAI">
                  执行AI分析
                </el-button>
              </div>
            </div>
          </template>
          
          <!-- AI分析结果展示 -->
          <div v-if="aiAnalysisResult" class="ai-analysis-result">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="交易对">{{ aiAnalysisResult.symbol }}</el-descriptions-item>
              <el-descriptions-item label="分析时间">
                {{ new Date(aiAnalysisResult.timestamp).toLocaleString() }}
              </el-descriptions-item>
              <el-descriptions-item label="交易建议">
                <el-tag :type="getRecommendationType(aiAnalysisResult.recommendation)" size="large">
                  {{ getRecommendationText(aiAnalysisResult.recommendation) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="置信度">
                <el-progress 
                  :stroke-width="20"
                  :percentage="aiAnalysisResult.confidence" 
                  :color="getConfidenceColor(aiAnalysisResult.confidence)"
                  :show-text="true"
                />
              </el-descriptions-item>
              <el-descriptions-item label="风险等级">
                <el-tag :type="getRiskLevelType(aiAnalysisResult.riskLevel)" size="default">
                  {{ aiAnalysisResult.riskLevel }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="市场情绪">
                <el-tag :type="getSentimentType(aiAnalysisResult.marketSentiment)" size="default">
                  {{ aiAnalysisResult.marketSentiment }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="分析理由" :span="2">
                <div class="ai-reasoning">{{ aiAnalysisResult.reasoning }}</div>
              </el-descriptions-item>
              <el-descriptions-item v-if="aiAnalysisResult.suggestedPrice" label="建议价格">
                {{ aiAnalysisResult.suggestedPrice.toFixed(2) }}
              </el-descriptions-item>
              <el-descriptions-item v-if="aiAnalysisResult.suggestedAmount" label="建议数量">
                {{ aiAnalysisResult.suggestedAmount.toFixed(6) }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
          
          <div v-else class="ai-analysis-empty">
            <el-empty description="点击'执行AI分析'按钮开始分析" />
          </div>
        </el-card>

        <!-- 交易记录 -->
        <el-card shadow="hover" class="records-card">
          <template #header>
            <div class="card-header">
              <span>交易记录（全部）</span>
            </div>
          </template>
          <el-table :data="sortedTradeRecords" stripe style="width: 100%">
            <el-table-column prop="symbol" label="交易对" width="120" />
            <el-table-column label="买入价" width="120">
              <template #default="{ row }">
                {{ row.buyPrice?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="卖出价">
              <template #default="{ row }">
                {{ row.sellPrice?.toFixed(2) || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="数量">
              <template #default="{ row }">
                {{ row.amount?.toFixed(5) }}
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
                <el-tooltip
                  v-if="row.status === 'failed' && row.failureReason"
                  :content="row.failureReason"
                  placement="top"
                >
                  <el-tag type="danger">
                    失败
                  </el-tag>
                </el-tooltip>

                <el-tag
                  v-else
                  :type="row.status === 'completed'
                    ? 'success'
                    : row.status === 'failed'
                      ? 'danger'
                      : 'warning'"
                >
                  {{
                    row.status === 'completed'
                      ? '已完成'
                      : row.status === 'failed'
                        ? '失败'
                        : '进行中'
                  }}
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
import type { TradingSymbol } from '../../types/trading'

const store = useTradingStore()
const loading = ref(false)
const testing = ref(false)
const loadingBalance = ref(false)
const resettingCircuitBreaker = ref(false)

// 市价买卖相关
const marketBuying = ref(false)
const marketSelling = ref(false)

// AI分析相关
const selectedAISymbol = ref(store.config.symbols[0])
const testingAI = ref(false)
const aiAnalysisResult = ref<any>(null)

// 交易间隔分钟数（用于显示和输入）
const tradeIntervalMinutes = computed({
  get: () => Math.round(store.config.tradeInterval / 1000 / 60),
  set: (minutes) => {
    store.config.tradeInterval = minutes * 60 * 1000
  }
})

// 定时器 & 停止标志
let timer: number | null = null, stopped = false

// 执行一次数据刷新
const refreshOnce = async () => {
  await Promise.all([
    refreshBalance(),
    store.loadPersistedData(),
    store.fetchCircuitBreakerState()
  ])
  
  setTimeout(() => {
    refreshAnalysis() 
  }, 500)
  
}

// 定时刷新循环
async function loop() {
  if (stopped) return
  try {
    await refreshOnce()
  } catch (e) {
    console.error('定时刷新失败:', e)
  }
  if (!stopped) {
    timer = window.setTimeout(loop, 30000)
  }
}

// 页面加载启动刷新
onMounted(async () => { 
  await refreshOnce(); loop() 
})

// 页面卸载停止刷新
onUnmounted(() => {
  stopped = true
  timer !== null && (clearTimeout(timer), timer = null)
})


// 添加计算属性，按开始时间倒序排列交易记录
const sortedTradeRecords = computed(() => {
  return [...store.tradeRecords].sort((a, b) => b.startTime - a.startTime)
})

// 计算当前交易状态的未实现盈亏（基于tradingStatus）
const unrealizedProfit = computed(() => {
  if (!store.tradingStatus.buyOrder || !store.tradingStatus.symbol) {
    return 0
  }
  const currentPrice = store.currentPrices[store.tradingStatus.symbol]
  if (!currentPrice || !store.tradingStatus.buyOrder.price) {
    return 0
  }
  return (currentPrice - store.tradingStatus.buyOrder.price) * store.tradingStatus.buyOrder.amount
})

// 计算未实现盈亏率
const unrealizedProfitRate = computed(() => {
  if (!store.tradingStatus.buyOrder || !store.tradingStatus.buyOrder.price || !store.tradingStatus.buyOrder.amount) {
    return 0
  }
  const profit = unrealizedProfit.value
  const cost = store.tradingStatus.buyOrder.price * store.tradingStatus.buyOrder.amount
  return (profit / cost) * 100
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

// 刷新振幅分析
const refreshAnalysis = async () => {
  loading.value = true
  try {
    // 检查是否启用多时间框架
    const apiPath = store.config.multiTimeframe?.enabled 
      ? '/api/trading/analyze-mtf'  // 使用多时间框架API
      : '/api/trading/analyze'       // 使用单时间框架API
    
    const result = await $fetch(apiPath, {
      params: {
        symbols: store.config.symbols.join(','),
        amplitudeThreshold: store.config.amplitudeThreshold,
        trendThreshold: store.config.trendThreshold,
        priceRangeRatio: store.config.trading.priceRangeRatio,
        tradedSymbols: JSON.stringify(store.stats.tradedSymbols),
      }
    }) as any
    
    // 根据API类型更新数据
    if (store.config.multiTimeframe?.enabled) {
      // 多时间框架数据
      store.updateAmplitudeAnalyses(result.allAnalyses || [])
    } else {
      // 单时间框架数据（保持兼容）
      store.updateAmplitudeAnalyses(result.allAnalyses || [])
    }
    
    // 同时获取当前价格
    await refreshCurrentPrices()
    
    // 获取AI分析结果（如果启用）
    if (store.config.ai.enabled) {
      await refreshAIAnalysis()
    }
  } catch (error) {
    console.error('刷新振幅分析失败:', error)
  } finally {
    loading.value = false
  }
}

// 刷新AI分析结果
const refreshAIAnalysis = async () => {
  try {
    // 使用 Promise.all 并行调用所有交易对的AI分析
    const promises = store.config.symbols.map(symbol => 
      store.fetchAIAnalysis(symbol as TradingSymbol)
    )
    await Promise.all(promises)
  } catch (error) {
    console.error('刷新AI分析失败:', error)
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

// 处理重置熔断器
const handleResetCircuitBreaker = async () => {
  resettingCircuitBreaker.value = true
  try {
    const result = await store.resetCircuitBreaker()
    if (result && result.success) {
      ElMessage.success(result.message || '熔断器已重置')
    }
  } catch (error: any) {
    ElMessage.error('重置熔断器失败: ' + error.message)
  } finally {
    resettingCircuitBreaker.value = false
  }
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

// 获取今日完成的交易次数
const getTodayCompletedTrades = () => {
  const today = new Date().toLocaleDateString('zh-CN')
  return store.tradeRecords.filter(record => {
    if (record.status !== 'completed') return false
    const recordDate = new Date(record.startTime).toLocaleDateString('zh-CN')
    return recordDate === today
  }).length
}

// 获取交易间隔状态
const getTradeIntervalStatus = () => {
  if (store.config.tradeInterval <= 0) return '无间隔限制'
  
  const completedTrades = store.tradeRecords.filter(record => record.status === 'completed')
  if (completedTrades.length === 0) return '可立即交易'
  
  const lastCompletedTrade = completedTrades.sort((a, b) => 
    (b.endTime || 0) - (a.endTime || 0)
  )[0]
  
  if (!lastCompletedTrade || !lastCompletedTrade.endTime) return '可立即交易'
  
  const timeSinceLastTrade = Date.now() - lastCompletedTrade.endTime
  if (timeSinceLastTrade >= store.config.tradeInterval) {
    return '可立即交易'
  } else {
    const remainingMinutes = Math.ceil((store.config.tradeInterval - timeSinceLastTrade) / 1000 / 60)
    return `等待 ${remainingMinutes} 分钟`
  }
}

// 格式化趋势百分比
const formatTrend = (trend: number | undefined) => {
  if (trend === undefined) return '-'
  return `${trend > 0 ? '+' : ''}${trend.toFixed(2)}%`
}

// 格式化振幅百分比
const formatAmplitude = (amplitude: number | undefined) => {
  if (amplitude === undefined) return '-'
  return `${amplitude.toFixed(2)}%`
}

// 获取趋势标签类型
const getTrendType = (trend: number | undefined) => {
  if (trend === undefined) return 'info'
  if (trend > 2) return 'success'  // 上涨趋势
  if (trend < -2) return 'danger'  // 下跌趋势
  return 'info'  // 震荡
}

// 获取振幅标签类型
const getAmplitudeType = (amplitude: number | undefined) => {
  if (amplitude === undefined) return 'info'
  if (amplitude >= store.config.amplitudeThreshold) return 'success'  // 振幅达标
  return 'warning'  // 振幅不足
}

// 判断时间框架是否通过
const isTimeframePassed = (analysis: any) => {
  if (!analysis) return false
  // 需要同时满足：振幅达标 && 趋势不被过滤
  return !analysis.isTrendFiltered && analysis.amplitude >= store.config.amplitudeThreshold
}

// 检查15m振幅是否达标
const is15mAmplitudePassed = (row: any): boolean => {
  if (!row.timeframes || !row.timeframes['15m']) return false
  const analysis15m = row.timeframes['15m']
  return !analysis15m.isTrendFiltered && analysis15m.amplitude >= store.config.amplitudeThreshold
}

// 获取确认状态显示信息
const getConfirmationStatus = (row: any): { text: string; type: 'success' | 'warning' | 'danger' | 'info' | 'primary'; tooltip?: string } => {
  const isValid = row.isValid === true
  const is15mPassed = is15mAmplitudePassed(row)
  
  // 获取当前交易对的AI分析结果
  const symbol = row.symbol as TradingSymbol
  const aiAnalysis = store.aiAnalysisCache[symbol]
  const isAIPassed = aiAnalysis ? store.checkAIPassed(aiAnalysis, 'buy') : true
  
  // 如果多时间框架通过但AI分析不通过
  if (isValid && !isAIPassed) {
    // 构建详细的AI分析信息
    let aiDetails = '多时间框架通过但AI分析未通过'
    if (aiAnalysis) {
      const recommendationText = getRecommendationText(aiAnalysis.recommendation)
      const riskLevelText = aiAnalysis.riskLevel
      const sentimentText = aiAnalysis.marketSentiment
      // 使用换行符分隔，使tooltip更易读
      aiDetails = `多时间框架通过但AI分析未通过\n\n` +
                  `AI分析结果:\n` +
                  `• 交易对: ${symbol}\n` +
                  `• 推荐: ${recommendationText}\n` +
                  `• 置信度: ${aiAnalysis.confidence}%\n` +
                  `• 风险等级: ${riskLevelText}\n` +
                  `• 市场情绪: ${sentimentText}`
    }
    
    return {
      text: '⚠️ AI未过',
      type: 'warning',
      tooltip: aiDetails
    }
  }
  
  // 如果评分通过但15m未达标，显示"未过"并给出提示
  if (isValid && !is15mPassed) {
    return {
      text: '❌ 未过',
      type: 'warning',
      tooltip: '评分通过但15分钟振幅未达标'
    }
  }
  
  // 正常情况
  return {
    text: isValid ? '✅ 通过' : '❌ 未过',
    type: isValid ? 'success' : 'warning',
    tooltip: isValid ? '多时间框架确认通过' : '多时间框架确认未通过'
  }
}

// 获取评分颜色
const getScoreColor = (score: number | undefined) => {
  if (!score) return '#909399'
  if (score >= 80) return '#67c23a'  // 绿色
  if (score >= 60) return '#e6a23c'  // 橙色
  return '#f56c6c'  // 红色
}

// AI分析测试函数
const testAIAnalysis = async () => {
  testingAI.value = true
  try {
    // 使用 store 的 fetchAIAnalysis 函数（带缓存）
    const analysis = await store.fetchAIAnalysis(selectedAISymbol.value as TradingSymbol)
    
    if (analysis) {
      aiAnalysisResult.value = analysis
      ElMessage.success(`AI分析完成: ${analysis.recommendation} (${analysis.confidence}% 置信度)`)
    } else {
      ElMessage.error('AI分析失败')
    }
  } catch (error: any) {
    ElMessage.error('AI分析请求失败: ' + error.message)
  } finally {
    testingAI.value = false
  }
}

// 辅助函数
const getRecommendationType = (recommendation: string) => {
  const typeMap: Record<string, any> = {
    'BUY': 'success',
    'SELL': 'danger',
    'HOLD': 'warning',
    'AVOID': 'info'
  }
  return typeMap[recommendation] || 'info'
}

const getRecommendationText = (recommendation: string) => {
  const textMap: Record<string, string> = {
    'BUY': '买入',
    'SELL': '卖出',
    'HOLD': '持有',
    'AVOID': '避免交易'
  }
  return textMap[recommendation] || recommendation
}

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 80) return '#67c23a'
  if (confidence >= 60) return '#e6a23c'
  return '#f56c6c'
}

const getRiskLevelType = (riskLevel: string) => {
  const typeMap: Record<string, any> = {
    'LOW': 'success',
    'MEDIUM': 'warning',
    'HIGH': 'danger'
  }
  return typeMap[riskLevel] || 'info'
}

const getSentimentType = (sentiment: string) => {
  const typeMap: Record<string, any> = {
    'BULLISH': 'success',
    'BEARISH': 'danger',
    'NEUTRAL': 'info'
  }
  return typeMap[sentiment] || 'info'
}
// 从交易状态面板市价买入
const handleMarketBuyFromStatus = async () => {
  if (!store.tradingStatus.buyOrder || !store.tradingStatus.symbol) {
    ElMessage.warning('没有可用的买单信息')
    return
  }

  try {
    const buyOrder = store.tradingStatus.buyOrder

    await ElMessageBox.confirm(
      `确定要市价买入 ${store.tradingStatus.symbol} 吗？\n` +
      '确认市价买入',
      {
        confirmButtonText: '确定买入',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    marketBuying.value = true
    const result = await store.marketBuy(
      store.tradingStatus.symbol, 
      buyOrder.amount,
      buyOrder.orderId
    )
    
    if (result && result.success) {
      ElMessage.success(`市价买入成功！成交价: ${result.order?.price || '未知'}`)
      await store.loadPersistedData()
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(`市价买入失败: ${error.message}`)
    }
  } finally {
    marketBuying.value = false
  }
}

// 从交易状态面板市价卖出（基于tradingStatus）
const handleMarketSellFromStatus = async () => {
  if (!store.tradingStatus.buyOrder || !store.tradingStatus.symbol) {
    ElMessage.warning('没有可用的买单信息')
    return
  }

  try {
    const buyOrder = store.tradingStatus.buyOrder

    await ElMessageBox.confirm(
      `确定要市价卖出 ${store.tradingStatus.symbol} 吗？\n` +

      '确认市价卖出',
      {
        confirmButtonText: '确定卖出',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    marketSelling.value = true
    
    // 调用市价卖出，传入可能存在的卖单ID以取消
    const result = await store.marketSell(
      store.tradingStatus.symbol as TradingSymbol, 
      buyOrder.amount,
      store.tradingStatus.sellOrder?.orderId // 如果有挂单，则取消
    )
    
    if (result && result.success) {
      ElMessage.success(`市价卖出成功！成交价: ${result.order?.price || '未知'}`)
      await store.loadPersistedData()
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(`市价卖出失败: ${error.message}`)
    }
  } finally {
    marketSelling.value = false
  }
}
</script>

<style scoped>
.trading-container {
  min-height: calc(100vh - 70px); /* 减去底部导航高度 */
  background: #f5f7fa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .trading-container {
    min-height: calc(100vh - 60px);
  }
}

@media (max-width: 480px) {
  .trading-container {
    min-height: calc(100vh - 55px);
  }
}

/* 桌面端适配 */
@media (min-width: 769px) {
  .trading-container {
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
  
  /* 统计卡片移动端优化 */
  .stat-value {
    font-size: 20px;
  }
  
  .stat-label {
    font-size: 12px;
  }
  
  .stats-row {
    margin-bottom: 10px;
  }
  
  .stats-row :deep(.el-col) {
    margin-bottom: 10px;
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
  .analysis-card :deep(.el-table),
  .records-card :deep(.el-table) {
    font-size: 12px;
  }
  
  .analysis-card,
  .records-card {
    overflow-x: auto;
  }
  
  /* 描述列表移动端优化 */
  .status-content :deep(.el-descriptions) {
    font-size: 12px;
  }
  
  .status-content :deep(.el-descriptions__label),
  .status-content :deep(.el-descriptions__content) {
    padding: 8px 10px;
  }
  
  /* 手动交易表单移动端优化 */
  .manual-trading-card :deep(.el-form-item__label) {
    font-size: 14px;
  }
  
  .manual-trading-card :deep(.el-col) {
    width: 100%;
    max-width: 100%;
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
  
  .stat-value {
    font-size: 18px;
  }
  
  .balance-amount {
    font-size: 12px;
  }
  
  /* 小屏幕下隐藏部分表格列 */
  .analysis-card :deep(.el-table__body-wrapper) {
    overflow-x: scroll;
  }
  
  .records-card :deep(.el-table__body-wrapper) {
    overflow-x: scroll;
  }
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
  font-size: 22px;
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

/* AI分析卡片样式 */
.ai-analysis-card {
  margin-bottom: 20px;
}

.ai-analysis-result {
  padding: 10px 0;
}

.ai-reasoning {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  line-height: 1.6;
  color: #606266;
  font-size: 14px;
}

.ai-analysis-empty {
  padding: 40px 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .ai-analysis-card :deep(.el-descriptions) {
    font-size: 12px;
  }
  
  .ai-analysis-card :deep(.el-descriptions__label),
  .ai-analysis-card :deep(.el-descriptions__content) {
    padding: 8px 10px;
  }
  
  .ai-reasoning {
    font-size: 12px;
    padding: 8px;
  }
  
  .ai-analysis-card .card-header {
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .ai-analysis-card .card-header > div {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
}
</style>
