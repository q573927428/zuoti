import { getBotInstance } from '../../../modules/trading-bot'

/**
 * 重置熔断器
 */
export default defineEventHandler(async (event) => {
  try {
    const bot = getBotInstance()
    bot.resetCircuitBreaker()
    
    return {
      success: true,
      message: '熔断器已重置'
    }
  } catch (error) {
    console.error('重置熔断器失败:', error)
    throw createError({
      statusCode: 500,
      message: '重置熔断器失败',
    })
  }
})
