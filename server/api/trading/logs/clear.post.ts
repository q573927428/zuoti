import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // 清空日志
    logger.clearLogs()
    
    console.log('🗑️ 日志已清空')
    
    return {
      success: true,
      message: '日志已清空',
      timestamp: Date.now(),
    }
  } catch (error: any) {
    console.error('清空日志失败:', error)
    return {
      success: false,
      message: error.message || '清空日志失败',
      error: error.message,
    }
  }
})
