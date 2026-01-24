import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    // 解析查询参数
    const level = query.level as string || 'all'
    const limit = query.limit ? parseInt(query.limit as string) : 100
    const offset = query.offset ? parseInt(query.offset as string) : 0
    const since = query.since ? parseInt(query.since as string) : 0
    const search = query.search as string || ''
    
    // 验证参数
    const validLevels = ['all', 'info', 'warn', 'error', 'debug']
    if (!validLevels.includes(level)) {
      throw new Error(`无效的日志级别: ${level}`)
    }
    
    if (limit < 1 || limit > 1000) {
      throw new Error('limit参数必须在1-1000之间')
    }
    
    if (offset < 0) {
      throw new Error('offset参数不能为负数')
    }
    
    // 获取日志
    const logs = logger.getLogs({
      level: level as any,
      limit,
      offset,
      since,
      search,
    })
    
    // 获取日志统计
    const stats = logger.getStats()
    
    return {
      success: true,
      data: {
        logs,
        stats,
        query: {
          level,
          limit,
          offset,
          since,
          search,
        },
        timestamp: Date.now(),
      },
    }
  } catch (error: any) {
    console.error('获取日志失败:', error)
    return {
      success: false,
      message: error.message || '获取日志失败',
      error: error.message,
    }
  }
})
