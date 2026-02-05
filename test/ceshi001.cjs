require('dotenv').config()
const ccxt = require('ccxt')

async function main() {
  const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    enableRateLimit: true,
    options: {
      defaultType: 'spot', // 现货
    },
  })

  await exchange.loadMarkets()

  const symbol = 'BTC/USDT'

  // 查询当前未成交现货订单
  const openOrders = await exchange.fetchOpenOrders(symbol)

  console.log('当前未成交订单数量:', openOrders.length)

  for (const o of openOrders) {
    console.log({
      id: o.id,
      type: o.type,
      side: o.side,
      price: o.price,
      status: o.status,
    })
  }

  // 查询单个现货订单
  const orderId = '56714002432'
  const order = await exchange.fetchOrder(orderId, symbol)
  console.log('订单详情:', order)
}

main().catch(err => {
  console.error('执行失败:', err.message)
})
