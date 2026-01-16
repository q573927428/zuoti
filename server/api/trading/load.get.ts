import { readFile } from 'fs/promises'
import { join } from 'path'
import { getCurrentDate } from '../../utils/date'

export default defineEventHandler(async (event) => {
  try {
    const dataPath = join(process.cwd(), 'data', 'trading-data.json')
    
    try {
      const data = await readFile(dataPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      // 文件不存在或解析失败，返回空数据
      return {
        tradeRecords: [],
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
        tradingStatus: {
          state: 'IDLE',
          lastUpdateTime: Date.now(),
        },
        config: {
          isTestnet: false,
          isAutoTrading: false,
          symbols: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'],
          investmentAmount: 100,
          amplitudeThreshold: 0.5,
          trendThreshold: 5.0,
          orderTimeout: 60 * 60 * 1000,
        },
      }
    }
  } catch (error) {
    console.error('加载交易数据失败:', error)
    throw createError({
      statusCode: 500,
      message: '加载交易数据失败',
    })
  }
})
