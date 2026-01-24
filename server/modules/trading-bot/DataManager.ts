import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { TradingSymbol, TradingStatus, TradeRecord, SystemConfig, SystemStats } from '../../../types/trading'
import { getCurrentDate } from '../../utils/date'

/**
 * 数据管理器 - 负责数据的加载、保存和初始化
 */
export class DataManager {
  private readonly DATA_DIR = join(process.cwd(), 'data')
  private readonly CONFIG_PATH = join(this.DATA_DIR, 'trading-config.json')
  private readonly DATA_PATH = join(this.DATA_DIR, 'trading-data.json')
  
  /**
   * 获取默认配置
   */
  getDefaultConfig(): SystemConfig {
    return {
      isTestnet: false,        // 是否使用币安测试网
      isAutoTrading: true,    // 是否开启自动交易主开关
      symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'] as TradingSymbol[],
      investmentAmount: 100,   // 单次交易的投入金额（USDT
      amplitudeThreshold: 2.0,  // 价格振幅阈值（%）
      trendThreshold: 10.0,      // 趋势强度阈值（%）
      
      // 订单超时配置
      orderTimeout: {
        default: 120 * 60 * 1000, // 2小时
        buy: 60 * 60 * 1000,      // 买单1小时
        sell: 120 * 60 * 1000,     // 卖单2小时
      },
      
      // 熔断机制配置
      circuitBreaker: {
        enabled: true,
        consecutiveFailures: 5,        // 连续失败5次触发
        dailyLossLimit: 20,             // 单日亏损20 USDT
        totalLossLimit: 100,            // 总亏损200 USDT
        cooldownPeriod: 12 * 60 * 60 * 1000, // 冷却12小时
        priceVolatilityThreshold: 10,   // 价格波动10%
      },
      
      // 日切配置
      dailyReset: {
        processingTime: '23:30',        // 23:30开始日切处理
        warningTime: '23:00',           // 23:00开始预警
        forceLiquidationDiscount: 0.999, // 强平价格折扣
      },
      
      // 止损配置
      stopLoss: {
        enabled: true,
        threshold: -2,                  // -2%止损
        executionDiscount: 0.998,       // 执行价格折扣
        waitTime: 5000,                 // 等待5秒
      },
      
      // 交易参数配置
      trading: {
        priceDeviationThreshold: 2,
        partialFillThreshold: 0.9,
        balanceSafetyBuffer: 0.05,
        marketOrderDiscount: 0.999,
        priceRangeRatio: 0.1, // 买入/卖出价格距离边界10%
      },
      
      // 多时间框架配置
      multiTimeframe: {
        enabled: true,
        strictMode: false,
        weights: {
          '15m': 0.4,
          '1h': 0.35,
          '4h': 0.25
        },
        scoreThreshold: 60,
        lookbackPeriods: {
          '15m': 48,
          '1h': 24,
          '4h': 12
        }
      },
      
      // 交易次数和间隔配置
      dailyTradeLimit: 3,                    // 每日交易次数限制
      tradeInterval: 60 * 60 * 1000,         // 交易间隔时间（1小时）
      ai: {
        enabled: true,
        analysisInterval: 86400000,
        minConfidence: 60,
        maxRiskLevel: "MEDIUM",
        useForBuyDecisions: true,
        useForSellDecisions: true,
        cacheDuration: 600000
      }
    }
  }
  
  /**
   * 获取默认交易状态
   */
  getDefaultStatus(): TradingStatus {
    return {
      state: 'IDLE',
      lastUpdateTime: Date.now(),
    }
  }
  
  /**
   * 获取默认统计数据
   */
  getDefaultStats(): SystemStats {
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      annualizedReturn: 0,
      currentDate: getCurrentDate(),
      tradedSymbols: {},
    }
  }
  
  /**
   * 加载配置和统计数据
   */
  async loadConfig(): Promise<{ config: SystemConfig; stats: SystemStats }> {
    try {
      const configFile = await readFile(this.CONFIG_PATH, 'utf-8')
      const configData = JSON.parse(configFile)
      
      return {
        config: configData.config || this.getDefaultConfig(),
        stats: configData.stats || this.getDefaultStats(),
      }
    } catch (error) {
      console.log('未找到配置文件，使用默认配置')
      return {
        config: this.getDefaultConfig(),
        stats: this.getDefaultStats(),
      }
    }
  }
  
  /**
   * 加载交易数据和状态
   */
  async loadTradingData(): Promise<{ tradingStatus: TradingStatus; tradeRecords: TradeRecord[] }> {
    try {
      const dataFile = await readFile(this.DATA_PATH, 'utf-8')
      const tradingData = JSON.parse(dataFile)
      
      return {
        tradingStatus: tradingData.tradingStatus || this.getDefaultStatus(),
        tradeRecords: tradingData.tradeRecords || [],
      }
    } catch (error) {
      console.log('未找到交易数据文件，初始化空数据')
      return {
        tradingStatus: this.getDefaultStatus(),
        tradeRecords: [],
      }
    }
  }
  
  /**
   * 保存所有数据（带重试机制）
   */
  async saveData(
    config: SystemConfig,
    stats: SystemStats,
    tradingStatus: TradingStatus,
    tradeRecords: TradeRecord[],
    retryCount: number = 3
  ): Promise<boolean> {
    let lastError: any
    
    for (let i = 0; i < retryCount; i++) {
      try {
        await mkdir(this.DATA_DIR, { recursive: true })
        
        // 保存配置和统计数据
        const configData = {
          config,
          stats,
          lastSaved: Date.now(),
        }
        await writeFile(this.CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8')
        
        // 保存交易记录和状态
        const tradingData = {
          tradingStatus,
          tradeRecords,
          lastSaved: Date.now(),
        }
        await writeFile(this.DATA_PATH, JSON.stringify(tradingData, null, 2), 'utf-8')
        
        // 保存成功后验证
        const savedConfigData = await readFile(this.CONFIG_PATH, 'utf-8')
        const savedTradingData = await readFile(this.DATA_PATH, 'utf-8')
        JSON.parse(savedConfigData)
        JSON.parse(savedTradingData)
        
        if (i > 0) {
          console.log(`✅ 数据保存成功（重试 ${i} 次后）`)
        }
        return true
      } catch (error) {
        lastError = error
        console.error(`❌ 保存数据失败 (尝试 ${i + 1}/${retryCount}):`, error)
        
        if (i < retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
    }
    
    console.error(`🚨 严重错误：数据保存失败，已重试 ${retryCount} 次`)
    console.error('最后错误:', lastError)
    console.error('⚠️  请立即检查磁盘空间和文件权限！当前状态可能未保存！')
    
    return false
  }
}
