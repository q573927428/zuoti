import type { TradingSymbol, OrderInfo } from '../../../types/trading'
import { createBuyOrder, createSellOrder, createMarketSellOrder, fetchOrderStatus, cancelOrder, fetchCurrentPrice } from '../../utils/binance'

/**
 * 订单管理器 - 负责订单操作的封装
 */
export class OrderManager {
  /**
   * 获取订单活跃时间（标准时间基准）
   */
  getOrderActiveTime(order: any, fallbackCreatedAt: number): number {
    // 有任何成交，用最近一次成交时间
    if (order?.filled && order.filled > 0) {
      return order.lastTradeTimestamp ?? order.timestamp ?? fallbackCreatedAt
    }
    
    // 从未成交，用下单时间
    return order?.timestamp ?? fallbackCreatedAt
  }
  
  /**
   * 创建买单
   */
  async createBuy(symbol: TradingSymbol, amount: number, price: number): Promise<OrderInfo> {
    const order = await createBuyOrder(symbol, amount, price)
    
    return {
      orderId: order.id,
      symbol,
      side: 'buy',
      price,
      amount,
      status: 'open',
      createdAt: Date.now(),
    }
  }
  
  /**
   * 创建卖单
   */
  async createSell(symbol: TradingSymbol, amount: number, price: number): Promise<OrderInfo> {
    const order = await createSellOrder(symbol, amount, price)
    
    return {
      orderId: order.id,
      symbol,
      side: 'sell',
      price,
      amount,
      status: 'open',
      createdAt: Date.now(),
    }
  }
  
  /**
   * 创建市价卖单
   */
  async createMarketSell(symbol: TradingSymbol, amount: number): Promise<OrderInfo> {
    const order = await createMarketSellOrder(symbol, amount)
    
    return {
      orderId: order.id,
      symbol,
      side: 'sell',
      price: order.average || order.price || 0,
      amount,
      status: 'closed', // 市价单立即成交
      createdAt: Date.now(),
      filledAt: Date.now(),
    }
  }
  
  /**
   * 查询订单状态
   */
  async getOrderStatus(symbol: TradingSymbol, orderId: string) {
    return await fetchOrderStatus(symbol, orderId)
  }
  
  /**
   * 取消订单
   */
  async cancel(symbol: TradingSymbol, orderId: string) {
    return await cancelOrder(symbol, orderId)
  }
  
  /**
   * 获取当前价格
   */
  async getCurrentPrice(symbol: TradingSymbol): Promise<number> {
    return await fetchCurrentPrice(symbol)
  }
  
  /**
   * 检查订单是否完全成交
   */
  isFullyFilled(orderStatus: any): boolean {
    return (
      orderStatus.status === 'closed' ||
      (orderStatus.filled && orderStatus.amount && orderStatus.filled >= orderStatus.amount)
    )
  }
  
  /**
   * 检查订单是否已取消
   */
  isCanceled(orderStatus: any): boolean {
    return orderStatus.status === 'canceled'
  }
  
  /**
   * 获取订单实际成交价格
   */
  getActualPrice(orderStatus: any, fallbackPrice: number): number {
    return orderStatus.average || fallbackPrice
  }
  
  /**
   * 获取订单实际成交数量
   */
  getActualAmount(orderStatus: any, fallbackAmount: number): number {
    return orderStatus.filled || fallbackAmount
  }
}
