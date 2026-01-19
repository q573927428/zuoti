import { readFile } from 'fs/promises'
import { join } from 'path'
import { getCurrentDate } from '../../utils/date'

export default defineEventHandler(async (event) => {
  try {
    const dataDir = join(process.cwd(), 'data')
    const configPath = join(dataDir, 'trading-config.json')  // 配置和统计
    const dataPath = join(dataDir, 'trading-data.json')      // 交易记录和状态
    
    // 加载配置和统计数据
    let configData
    try {
      const configFile = await readFile(configPath, 'utf-8')
      configData = JSON.parse(configFile)
    } catch (error) {
      configData = {
        config: {
          isTestnet: false,
          isAutoTrading: false,
          symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'],
          investmentAmount: 100,
          amplitudeThreshold: 3,
          trendThreshold: 5.0,
          orderTimeout: 60 * 60 * 1000,
        },
        stats: {
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0,
          totalProfit: 0,
          totalProfitRate: 0,
          annualizedReturn: 0,
          currentDate: getCurrentDate(),
          tradedSymbols: {},
        },
      }
    }
    
    // 加载交易数据和状态
    let tradingData
    try {
      const dataFile = await readFile(dataPath, 'utf-8')
      tradingData = JSON.parse(dataFile)
    } catch (error) {
      tradingData = {
        tradingStatus: {
          state: 'IDLE',
          lastUpdateTime: Date.now(),
        },
        tradeRecords: [],
      }
    }
    
    // 合并返回
    return {
      config: configData.config,
      stats: configData.stats,
      tradingStatus: tradingData.tradingStatus,
      tradeRecords: tradingData.tradeRecords,
    }
  } catch (error) {
    console.error('加载交易数据失败:', error)
    throw createError({
      statusCode: 500,
      message: '加载交易数据失败',
    })
  }
})
