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
  failureReason?: string // 交易失败原因
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

// 订单超时配置
export interface OrderTimeoutConfig {
  default: number // 默认超时（毫秒）
  buy?: number // 买单超时
  sell?: number // 卖单超时
  bySymbol?: Record<TradingSymbol, number> // 按交易对自定义
}

// 熔断机制配置
export interface CircuitBreakerConfig {
  enabled: boolean // 是否启用熔断
  consecutiveFailures: number // 连续失败次数阈值
  dailyLossLimit: number // 单日亏损限额（USDT）
  totalLossLimit: number // 总亏损限额（USDT）
  cooldownPeriod: number // 熔断后冷却时间（毫秒）
  priceVolatilityThreshold: number // 价格波动阈值（%）
}

// 日切配置
export interface DailyResetConfig {
  processingTime: string // 日切处理时间 "HH:mm"
  warningTime: string // 日切预警时间 "HH:mm"
  forceLiquidationDiscount: number // 强平价格折扣
}

// 止损配置
export interface StopLossConfig {
  enabled: boolean // 是否启用止损
  threshold: number // 止损阈值（%，负数）
  executionDiscount: number // 执行价格折扣
  waitTime: number // 等待确认时间（毫秒）
}

// 交易参数配置
export interface TradingParametersConfig {
  priceDeviationThreshold: number // 价格偏离阈值（%）
  partialFillThreshold: number // 部分成交判定阈值（0-1）
  balanceSafetyBuffer: number // 余额安全缓冲（0-1）
  marketOrderDiscount: number // 市价单价格折扣
  priceRangeRatio: number // 买入/卖出价格距离边界的比例（0-0.5，默认0.1）
}

// 系统配置
export interface SystemConfig {
  isTestnet: boolean // 是否使用模拟交易
  isAutoTrading: boolean // 是否开启自动交易
  symbols: TradingSymbol[] // 监控的交易对
  investmentAmount: number // 每次投资金额（USDT）
  amplitudeThreshold: number // 振幅阈值
  trendThreshold: number // 趋势过滤阈值
  orderTimeout: OrderTimeoutConfig // 订单超时配置
  circuitBreaker: CircuitBreakerConfig // 熔断机制配置
  dailyReset: DailyResetConfig // 日切配置
  stopLoss: StopLossConfig // 止损配置
  trading: TradingParametersConfig // 交易参数配置
  dailyTradeLimit: number // 每日交易次数限制，0表示无限制
  tradeInterval: number // 交易间隔时间（毫秒），0表示无间隔
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
