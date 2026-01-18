import { getBotInstance } from '../../../modules/trading-bot'

/**
 * 获取熔断器状态
 */
export default defineEventHandler(async (event) => {
  try {
    const bot = getBotInstance()
    const state = bot.getCircuitBreakerState()
    
    return {
      success: true,
      data: state
    }
  } catch (error) {
    console.error('获取熔断器状态失败:', error)
    throw createError({
      statusCode: 500,
      message: '获取熔断器状态失败',
    })
  }
})
