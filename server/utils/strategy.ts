import type { TradingSymbol, Kline, AmplitudeAnalysis, MultiTimeframeAnalysis, MultiTimeframeConfig } from '../../types/trading'
import { fetchKlines } from './binance'

/**
 * 分析交易对的振幅和趋势
 */
export async function analyzeAmplitude(
  symbol: TradingSymbol,
  amplitudeThreshold: number = 3,
  trendThreshold: number = 5.0,
  priceRangeRatio: number = 0.1
): Promise<AmplitudeAnalysis> {
  try {
    // 获取最近12小时（48根15分钟K线）
    const klines = await fetchKlines(symbol, '15m', 48)
    
    if (klines.length === 0) {
      throw new Error(`无法获取${symbol}的K线数据`)
    }

    // 计算12小时内的最高价和最低价
    const high = Math.max(...klines.map(k => k.high))
    const low = Math.min(...klines.map(k => k.low))
    
    // 计算振幅百分比
    const amplitude = ((high - low) / low) * 100
    
    // 计算趋势（使用首尾收盘价）
    const firstClose = klines[0].close
    const lastClose = klines[klines.length - 1].close
    const trendPercent = ((lastClose - firstClose) / firstClose) * 100
    
    // 判断是否被趋势过滤（单边趋势超过阈值）
    const isTrendFiltered = Math.abs(trendPercent) > trendThreshold
    
    // 计算Range
    const range = high - low
    
    // 计算建议的买入价和卖出价（使用配置的比例）
    const buyPrice = low + priceRangeRatio * range
    const sellPrice = high - priceRangeRatio * range
    
    return {
      symbol,
      high,
      low,
      amplitude: parseFloat(amplitude.toFixed(2)),
      trend: parseFloat(trendPercent.toFixed(2)),
      isTrendFiltered,
      buyPrice: parseFloat(buyPrice.toFixed(8)),
      sellPrice: parseFloat(sellPrice.toFixed(8)),
    }
  } catch (error) {
    console.error(`分析${symbol}振幅失败:`, error)
    throw error
  }
}

/**
 * 分析所有交易对并找出最佳交易对
 */
export async function findBestTradingSymbol(
  symbols: TradingSymbol[],
  amplitudeThreshold: number = 3,
  trendThreshold: number = 5.0,
  priceRangeRatio: number = 0.1
): Promise<{ bestSymbol: AmplitudeAnalysis | null; allAnalyses: AmplitudeAnalysis[] }> {
  try {
    // 分析所有交易对
    const analyses = await Promise.all(
      symbols.map(symbol => analyzeAmplitude(symbol, amplitudeThreshold, trendThreshold, priceRangeRatio))
    )
    
    // 过滤出符合条件的交易对：振幅超过阈值且不在单边趋势中
    const validAnalyses = analyses.filter(a => 
      !a.isTrendFiltered && 
      a.amplitude >= amplitudeThreshold
    )
    
    // 找出振幅最大的交易对
    let bestSymbol: AmplitudeAnalysis | null = null
    if (validAnalyses.length > 0) {
      bestSymbol = validAnalyses.reduce((max, current) => 
        current.amplitude > max.amplitude ? current : max
      )
    }
    
    return {
      bestSymbol,
      allAnalyses: analyses,
    }
  } catch (error) {
    console.error('寻找最佳交易对失败:', error)
    throw error
  }
}

/**
 * 计算购买数量
 * @param investmentAmount 投资金额（USDT）
 * @param buyPrice 买入价格
 */
export function calculateBuyAmount(investmentAmount: number, buyPrice: number): number {
  const amount = investmentAmount / buyPrice
  // 保留合适的精度
  return parseFloat(amount.toFixed(8))
}

/**
 * 计算收益
 */
export function calculateProfit(
  amount: number,
  buyPrice: number,
  sellPrice: number
): { profit: number; profitRate: number } {
  const buyTotal = amount * buyPrice
  const sellTotal = amount * sellPrice
  const profit = sellTotal - buyTotal
  const profitRate = (profit / buyTotal) * 100
  
  return {
    profit: parseFloat(profit.toFixed(2)),
    profitRate: parseFloat(profitRate.toFixed(2)),
  }
}

/**
 * 检查是否需要保护（突破保护、跌破保护）
 */
export function checkProtection(
  currentPrice: number,
  high: number,
  low: number
): { needProtection: boolean; reason?: string } {
  // 突破保护：价格突破上界
  if (currentPrice > high) {
    return {
      needProtection: true,
      reason: `价格突破上界 ${high}，当前价格 ${currentPrice}`,
    }
  }
  
  // 跌破保护：价格跌破下界
  if (currentPrice < low) {
    return {
      needProtection: true,
      reason: `价格跌破下界 ${low}，当前价格 ${currentPrice}`,
    }
  }
  
  return { needProtection: false }
}

/**
 * 检查订单是否超时
 */
export function checkOrderTimeout(
  orderCreatedAt: number,
  timeout: number
): boolean {
  const now = Date.now()
  return (now - orderCreatedAt) > timeout
}

/**
 * 指定时间框架的振幅分析（辅助函数）
 */
async function analyzeAmplitudeWithTimeframe(
  symbol: TradingSymbol,
  timeframe: '15m' | '1h' | '4h',
  lookbackPeriods: number,
  amplitudeThreshold: number,
  trendThreshold: number,
  priceRangeRatio: number
): Promise<AmplitudeAnalysis> {
  const klines = await fetchKlines(symbol, timeframe, lookbackPeriods)
  
  if (klines.length === 0) {
    throw new Error(`无法获取${symbol}的${timeframe}K线数据`)
  }

  const high = Math.max(...klines.map(k => k.high))
  const low = Math.min(...klines.map(k => k.low))
  const amplitude = ((high - low) / low) * 100
  
  const firstClose = klines[0].close
  const lastClose = klines[klines.length - 1].close
  const trendPercent = ((lastClose - firstClose) / firstClose) * 100
  const isTrendFiltered = Math.abs(trendPercent) > trendThreshold
  
  const range = high - low
  const buyPrice = low + priceRangeRatio * range
  const sellPrice = high - priceRangeRatio * range
  
  return {
    symbol,
    high,
    low,
    amplitude: parseFloat(amplitude.toFixed(2)),
    trend: parseFloat(trendPercent.toFixed(2)),
    isTrendFiltered,
    buyPrice: parseFloat(buyPrice.toFixed(8)),
    sellPrice: parseFloat(sellPrice.toFixed(8)),
  }
}

/**
 * 多时间框架振幅分析
 */
export async function analyzeMultiTimeframe(
  symbol: TradingSymbol,
  amplitudeThreshold: number,
  trendThreshold: number,
  priceRangeRatio: number,
  config: MultiTimeframeConfig
): Promise<MultiTimeframeAnalysis> {
  // 并行获取三个时间框架的数据
  const [analysis15m, analysis1h, analysis4h] = await Promise.all([
    analyzeAmplitudeWithTimeframe(symbol, '15m', config.lookbackPeriods['15m'], amplitudeThreshold, trendThreshold, priceRangeRatio),
    analyzeAmplitudeWithTimeframe(symbol, '1h', config.lookbackPeriods['1h'], amplitudeThreshold, trendThreshold, priceRangeRatio),
    analyzeAmplitudeWithTimeframe(symbol, '4h', config.lookbackPeriods['4h'], amplitudeThreshold, trendThreshold, priceRangeRatio)
  ])

  // 检查各时间框架是否通过
  const passed15m = !analysis15m.isTrendFiltered && analysis15m.amplitude >= amplitudeThreshold
  const passed1h = !analysis1h.isTrendFiltered && analysis1h.amplitude >= amplitudeThreshold
  const passed4h = !analysis4h.isTrendFiltered && analysis4h.amplitude >= amplitudeThreshold

  const passedTimeframes = []
  const failedTimeframes = []
  if (passed15m) passedTimeframes.push('15m')
  else failedTimeframes.push('15m')
  if (passed1h) passedTimeframes.push('1h')
  else failedTimeframes.push('1h')
  if (passed4h) passedTimeframes.push('4h')
  else failedTimeframes.push('4h')

  const allPass = passed15m && passed1h && passed4h

  // 计算加权评分
  const score = 
    (passed15m ? 100 : 0) * config.weights['15m'] +
    (passed1h ? 100 : 0) * config.weights['1h'] +
    (passed4h ? 100 : 0) * config.weights['4h']

  // 判断是否有效
  const isValid = config.strictMode 
    ? allPass 
    : score >= config.scoreThreshold

  return {
    symbol,
    timeframes: {
      '15m': analysis15m,
      '1h': analysis1h,
      '4h': analysis4h
    },
    score: parseFloat(score.toFixed(2)),
    isValid,
    confirmationDetails: {
      allPass,
      passedTimeframes,
      failedTimeframes
    }
  }
}

/**
 * 使用多时间框架分析找出最佳交易对
 */
export async function findBestTradingSymbolMultiTimeframe(
  symbols: TradingSymbol[],
  amplitudeThreshold: number,
  trendThreshold: number,
  priceRangeRatio: number,
  multiTimeframeConfig: MultiTimeframeConfig
): Promise<{ 
  bestSymbol: MultiTimeframeAnalysis | null
  allAnalyses: MultiTimeframeAnalysis[] 
}> {
  try {
    // 分析所有交易对
    const analyses = await Promise.all(
      symbols.map(symbol => 
        analyzeMultiTimeframe(symbol, amplitudeThreshold, trendThreshold, priceRangeRatio, multiTimeframeConfig)
      )
    )
    
    // 过滤出通过多时间框架确认的交易对
    const validAnalyses = analyses.filter(a => a.isValid)
    
    // 按评分排序，评分相同时按1h振幅排序
    let bestSymbol: MultiTimeframeAnalysis | null = null
    if (validAnalyses.length > 0) {
      bestSymbol = validAnalyses.reduce((max, current) => {
        // 首先比较评分
        if (current.score > max.score) return current
        if (current.score < max.score) return max
        
        // 评分相同的情况下，比较1h振幅
        const currentAmplitude = current.timeframes['15m'].amplitude
        const maxAmplitude = max.timeframes['15m'].amplitude
        
        // 选择15m振幅更大的交易对
        return currentAmplitude > maxAmplitude ? current : max
      })
    }
    
    return {
      bestSymbol,
      allAnalyses: analyses,
    }
  } catch (error) {
    console.error('使用多时间框架寻找最佳交易对失败:', error)
    throw error
  }
}
