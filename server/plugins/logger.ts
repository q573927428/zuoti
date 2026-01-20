import { logger } from '../utils/logger'

/**
 * Server Plugin - 初始化日志收集器
 * 这个插件应该在其他插件之前加载，以确保尽早捕获日志
 */
export default defineNitroPlugin((nitroApp) => {
  // 记录插件加载信息
  console.log('📝 日志收集器插件已加载')
  
  // 测试日志捕获
  console.log('🚀 服务器启动完成，日志收集器已就绪')
})
