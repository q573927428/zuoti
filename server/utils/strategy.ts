import type { TradingSymbol, Kline, AmplitudeAnalysis } from '../../types/trading'
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
    // 获取最近6小时（24根15分钟K线）
    const klines = await fetchKlines(symbol, '15m', 24)
    
    if (klines.length === 0) {
      throw new Error(`无法获取${symbol}的K线数据`)
    }

    // 计算6小时内的最高价和最低价
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
