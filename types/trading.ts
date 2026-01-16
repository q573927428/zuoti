// 交易系统类型定义
export type TradingSymbol = 'ETH/USDT' | 'BTC/USDT' | 'BNB/USDT' | 'SOL/USDT'

export type TradingState = 'IDLE' | 'BUY_ORDER_PLACED' | 'BOUGHT' | 'SELL_ORDER_PLACED' | 'DONE'

// K线数据
export interface Kline {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// 振幅分析结果
export interface AmplitudeAnalysis {
  symbol: TradingSymbol
  high: number // 6小时内最高价
  low: number // 6小时内最低价
  amplitude: number // 振幅百分比
  trend: number // 趋势值（-1到1，负值为下跌趋势，正值为上涨趋势）
  isTrendFiltered: boolean // 是否被趋势过滤
  buyPrice: number // 建议买入价
  sellPrice: number // 建议卖出价
}

// 订单信息
export interface OrderInfo {
  orderId: string
  symbol: TradingSymbol
  side: 'buy' | 'sell'
  price: number
  amount: number
  status: 'open' | 'closed' | 'canceled'
  createdAt: number
  filledAt?: number
  canceledAt?: number
}

// 交易记录
export interface TradeRecord {
  id: string
  symbol: TradingSymbol
  buyOrderId: string
  sellOrderId?: string
  buyPrice: number
  sellPrice?: number
  amount: number
  profit?: number // 收益（USDT）
  profitRate?: number // 收益率
  startTime: number
  endTime?: number
  status: 'in_progress' | 'completed' | 'failed'
}

// 交易状态
export interface TradingStatus {
  state: TradingState
  symbol?: TradingSymbol
  currentTradeId?: string
  buyOrder?: OrderInfo
  sellOrder?: OrderInfo
  high?: number // 6小时内最高价（用于保护机制）
  low?: number // 6小时内最低价（用于保护机制）
  lastUpdateTime: number
}

// 系统配置
export interface SystemConfig {
  isTestnet: boolean // 是否使用模拟交易
  isAutoTrading: boolean // 是否开启自动交易
  symbols: TradingSymbol[] // 监控的交易对
  investmentAmount: number // 每次投资金额（USDT）
  amplitudeThreshold: number // 振幅阈值
  trendThreshold: number // 趋势过滤阈值
  orderTimeout: number // 订单超时时间（毫秒）
}

// 系统统计
export interface SystemStats {
  totalTrades: number // 总交易次数
  successfulTrades: number // 成功交易次数
  failedTrades: number // 失败交易次数
  totalProfit: number // 总收益（USDT）
  totalProfitRate: number // 总收益率
  annualizedReturn: number // 年化收益率
  currentDate: string // 当前日期
  tradedSymbols: Record<string, number> // 每个交易对今日交易次数
}
