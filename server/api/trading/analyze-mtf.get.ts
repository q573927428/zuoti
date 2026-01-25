import { findBestTradingSymbolMultiTimeframe } from '../../utils/strategy'
import type { TradingSymbol } from '../../../types/trading'

/**
 * 多时间框架分析API
 * GET /api/trading/analyze-mtf
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    // 解析参数
    const symbolsStr = query.symbols as string || 'BTC/USDT,ETH/USDT,BNB/USDT,SOL/USDT,XRP/USDT'
    const symbols = symbolsStr.split(',') as TradingSymbol[]
    const amplitudeThreshold = parseFloat(query.amplitudeThreshold as string) || 3
    const trendThreshold = parseFloat(query.trendThreshold as string) || 5
    const priceRangeRatio = parseFloat(query.priceRangeRatio as string) || 0.1
    
    // 读取配置以获取多时间框架配置
    const config = useRuntimeConfig()
    const { DataManager } = await import('../../modules/trading-bot/DataManager')
    const dataManager = new DataManager()
    const { config: systemConfig } = await dataManager.loadConfig()
    
    // 检查是否启用多时间框架
    if (!systemConfig.multiTimeframe.enabled) {
      return {
        error: '多时间框架分析未启用',
        bestSymbol: null,
        allAnalyses: []
      }
    }
    
    // 执行多时间框架分析
    const result = await findBestTradingSymbolMultiTimeframe(
      symbols,
      amplitudeThreshold,
      trendThreshold,
      priceRangeRatio,
      systemConfig.multiTimeframe
    )
    
    return {
      bestSymbol: result.bestSymbol,
      allAnalyses: result.allAnalyses,
      config: systemConfig.multiTimeframe
    }
  } catch (error: any) {
    console.error('多时间框架分析失败:', error)
    return {
      error: error.message,
      bestSymbol: null,
      allAnalyses: []
    }
  }
})
