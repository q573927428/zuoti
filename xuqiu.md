# zuoti

一个基于Nuxt 4和Vue 3的自动化交易系统，用于执行币安现货日内做T策略。

## 功能特性

- 实时监控ETH/USDT、BTC/USDT、BNB/USDT、SOL/USDT等交易对
- 基于振幅和趋势的交易策略
- 保护机制（突破保护、跌破保护、超时保护）
- 响应式UI界面
- 状态持久化（跨天）
- 持久化订单数据
- 数据本地化存储
- 全自动运行，可以自动下单，监控，卖出，撤单等等
- 前端可以设置交易对，开启暂停系统，查看交易记录，显示收益和损失，年化收益
- 前期刚开始功能简单一点，后期慢慢完善

## 环境配置

 `.env` 文件里面是币安模拟交易API密钥：
   ```bash
   BINANCE_API_KEY=VvwOAZcCoSsqpTjf42mUrFzdjuzat1vVuUhv0XdvyX41tl0zC6rOfbHUcUWGL6YV
   BINANCE_SECRET=CYhzclBL0vlXGZLnIvxx3D0kq4MZCXaxjAwdA5KpsKvIuUivIMOq5ZOPZkFloG6A
   ```

### 币安模拟交易设置

使用币安真实交易和模拟交易可以切换：
   
   是否开启模拟交易isTestnet: true开关, 如果开启则ccxt.binance实例化后 binance.setSandboxMode(true) 表示模拟交易


## 策略说明

此交易系统策略规格：

- K线周期：15分钟
- 区间统计窗口：最近6小时（24根15分钟K线）
- 振幅过滤：仅当(H - L) / L >= 3.5%时允许交易
- 交易对筛选：从提供的多个交易对中挑选振幅大于等于3.5%的，并且删选出振幅最大的哪个交易对交易对做交易
- 次数限制：一天内选择振幅最大的哪个交易对，最多只做一次完整交易
- 趋势过滤：防止在明显的单边趋势中交易
- 挂单价格：BuyPrice = L + 0.12 * Range, SellPrice = H - 0.12 * Range
- 固定投入：每次交易固定100 USDT
- 状态机：IDLE → BUY_ORDER_PLACED → BOUGHT → SELL_ORDER_PLACED → DONE
- 保护规则：突破保护、跌破保护、超时保护

## 技术栈

- Nuxt 4
- Vue 3
- TypeScript
- Element Plus
- CCXT (加密货币交易库)
- Pinia (状态管理)

## 代码规范
1. 使用TypeScript进行开发，并使用ESLint进行代码规范检查。
2. 模块化组件化开发，易维护，遵循单一职责原则。
3. 使用Pinia进行状态管理，并使用TypeScript进行类型定义。

## 注意事项
1. 代码不要出现错误，请使用TypeScript进行类型检查。
2. vue文件里面不需要引用这个 import { ElMessage } from 'element-plus'
3. 状态管理stores目录放在app目录下
4. 不要出现  不能将类型“string”分配给类型 类似类型的代码报错