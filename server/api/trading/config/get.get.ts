import { getBotInstance } from '../../../modules/trading-bot'

/**
 * 获取系统配置
 */
export default defineEventHandler(async (event) => {
  try {
    const bot = getBotInstance()
    const config = bot.getConfig()
    
    return {
      success: true,
      data: config
    }
  } catch (error) {
    console.error('获取配置失败:', error)
    throw createError({
      statusCode: 500,
      message: '获取配置失败',
    })
  }
})
