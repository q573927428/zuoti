import { TradingBot, setBotInstance } from '../modules/trading-bot'

/**
 * Server Plugin - 在服务器启动时自动运行
 */
export default defineNitroPlugin((nitroApp) => {
  console.log('🤖 交易机器人插件正在初始化...')
  
  const bot = new TradingBot()
  
  // 设置全局实例
  setBotInstance(bot)
  
  bot.initialize().then(() => {
    bot.start()
  })
})
