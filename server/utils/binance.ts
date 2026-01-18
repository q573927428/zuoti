import * as ccxt from 'ccxt'
import type { TradingSymbol, Kline } from '../../types/trading'

// 公共实例（不需要API密钥，用于查询公开数据）
let publicBinanceInstance: ccxt.binance | null = null

// 私有实例（需要API密钥，用于交易操作）
let privateBinanceInstance: ccxt.binance | null = null

/**
 * 获取公共币安实例（不需要API密钥）
 * 用于：获取K线、价格、市场数据等公开信息
 */
export function getPublicBinanceInstance(isTestnet: boolean = false): ccxt.binance {
  if (!publicBinanceInstance) {
    publicBinanceInstance = new ccxt.binance({
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
      }
    })

    if (isTestnet) {
      publicBinanceInstance.setSandboxMode(true)
    }
  }

  return publicBinanceInstance
}

/**
 * 获取私有币安实例（需要API密钥）
 * 用于：交易、查询订单、获取余额等需要认证的操作
 */
export function getPrivateBinanceInstance(isTestnet: boolean = false): ccxt.binance {
  const config = useRuntimeConfig()

  // 每次都重新创建实例，确保使用最新的配置
  privateBinanceInstance = new ccxt.binance({
    apiKey: config.binanceApiKey,
    secret: config.binanceSecret,
    enableRateLimit: true,
    options: {
      defaultType: 'spot',
    }
  })

  if (isTestnet) {
    privateBinanceInstance.setSandboxMode(true)
  }

  return privateBinanceInstance
}

/**
 * 获取币安实例（兼容旧代码）
 */
export function getBinanceInstance(isTestnet: boolean = false): ccxt.binance {
  return getPrivateBinanceInstance(isTestnet)
}

/**
 * 重置币安实例
 */
export function resetBinanceInstance() {
  publicBinanceInstance = null
  privateBinanceInstance = null
}

/**
 * 获取K线数据（公共接口，不需要API密钥）
 */
export async function fetchKlines(
  symbol: TradingSymbol,
  timeframe: string = '15m',
  limit: number = 24
): Promise<Kline[]> {
  try {
    const binance = getPublicBinanceInstance()
    await binance.loadMarkets()
    const ohlcv = await binance.fetchOHLCV(symbol, timeframe, undefined, limit)
    
    return ohlcv.map((candle) => ({
      timestamp: candle[0] as number,
      open: candle[1] as number,
      high: candle[2] as number,
      low: candle[3] as number,
      close: candle[4] as number,
      volume: candle[5] as number,
    }))
  } catch (error) {
    console.error(`获取${symbol} K线数据失败:`, error)
    throw error
  }
}

/**
 * 获取当前价格（公共接口，不需要API密钥）
 */
export async function fetchCurrentPrice(symbol: TradingSymbol): Promise<number> {
  try {
    const binance = getPublicBinanceInstance()
    const ticker = await binance.fetchTicker(symbol)
    return ticker.last || 0
  } catch (error) {
    console.error(`获取${symbol}当前价格失败:`, error)
    throw error
  }
}

/**
 * 创建限价买单（私有接口，需要API密钥）
 */
export async function createBuyOrder(
  symbol: TradingSymbol,
  amount: number,
  price: number
): Promise<any> {
  try {
    const binance = getPrivateBinanceInstance()
    const order = await binance.createLimitBuyOrder(symbol, amount, price)
    console.log(`创建买单成功: ${symbol} 数量:${amount} 价格:${price}`)
    return order
  } catch (error) {
    console.error(`创建买单失败: ${symbol}`, error)
    throw error
  }
}

/**
 * 创建限价卖单（私有接口，需要API密钥）
 */
export async function createSellOrder(
  symbol: TradingSymbol,
  amount: number,
  price: number
): Promise<any> {
  try {
    const binance = getPrivateBinanceInstance()
    const order = await binance.createLimitSellOrder(symbol, amount, price)
    console.log(`创建卖单成功: ${symbol} 数量:${amount} 价格:${price}`)
    return order
  } catch (error) {
    console.error(`创建卖单失败: ${symbol}`, error)
    throw error
  }
}

/**
 * 查询订单状态（私有接口，需要API密钥）
 */
export async function fetchOrderStatus(symbol: TradingSymbol, orderId: string): Promise<any> {
  try {
    const binance = getPrivateBinanceInstance()
    const order = await binance.fetchOrder(orderId, symbol)
    return order
  } catch (error) {
    console.error(`查询订单状态失败: ${orderId}`, error)
    throw error
  }
}

/**
 * 取消订单（私有接口，需要API密钥）
 */
export async function cancelOrder(symbol: TradingSymbol, orderId: string): Promise<any> {
  try {
    const binance = getPrivateBinanceInstance()
    const result = await binance.cancelOrder(orderId, symbol)
    console.log(`取消订单成功: ${orderId}`)
    return result
  } catch (error) {
    console.error(`取消订单失败: ${orderId}`, error)
    throw error
  }
}

/**
 * 获取账户余额（私有接口，需要API密钥）
 */
export async function fetchBalance(): Promise<any> {
  try {
    const binance = getPrivateBinanceInstance()
    const balance = await binance.fetchBalance()
    return balance
  } catch (error) {
    console.error('获取账户余额失败:', error)
    throw error
  }
}
