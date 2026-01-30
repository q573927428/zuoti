# zuoti

一个基于Nuxt 4和Vue 3的自动化交易系统，用于执行币安现货日内做T策略。

## 功能特性

- 实时监控ETH/USDT、BTC/USDT、BNB/USDT、SOL/USDT等交易对
- 基于振幅和趋势的交易策略
- 保护机制（突破保护、跌破保护、超时保护、止盈止损）
- 响应式UI界面
- 状态持久化（跨天）
- 持久化订单数据
- 数据本地化存储
- 全自动运行，可以自动下单，监控，卖出，撤单等等
- 前端可以开启暂停交易、查看当前状态，查看交易记录，显示收益和损失，年化收益
- 前期刚开始功能简单一点，后期慢慢完善

- ✅ **多交易对监控**：实时监控ETH/USDT、BTC/USDT、BNB/USDT、SOL/USDT等主流交易对
- ✅ **智能交易策略**：基于【主指标】ADX（15m / 1h / 4h）的智能交易决策，自动寻找最佳交易机会
- ✅ **多层保护机制**：完整的熔断、止损、突破保护、跌破保护、超时保护等风险控制
- ✅ **状态持久化**：交易状态、配置数据自动保存，支持跨天自动重置
- ✅ **全自动运行**：自动分析行情、开仓（带上止盈止损）、监控、平仓、撤单，无需人工干预
- ✅ **响应式UI界面**：基于Element Plus的现代化界面，支持移动端和桌面端
- ✅ **模拟交易支持**：支持币安模拟交易和真实交易一键切换
- ✅ **AI分析增强**：AI技术分析支持，提供评分更精准的交易建议

## 环境配置

 `.env` 文件里面是币安模拟交易API密钥：
   ```bash
   # 币安API配置
   BINANCE_API_KEY=VvwOAZcCoSsqpTjf42mUrFzdjuzat1vVuUhv0XdvyX41tl0zC6rOfbHUcUWGL6YV
   BINANCE_SECRET=CYhzclBL0vlXGZLnIvxx3D0kq4MZCXaxjAwdA5KpsKvIuUivIMOq5ZOPZkFloG6A

   # DeepSeek API 配置
   DEEPSEEK_API_KEY=sk-4af7bcce99fd4fe481d4ef8a56f04879
   DEEPSEEK_API_URL=https://api.deepseek.com
   ```

### 币安模拟交易设置

使用币安真实交易和模拟交易可以切换：
   
   是否开启模拟交易isTestnet: true开关, 如果开启则ccxt.binance实例化后 binance.setSandboxMode(true) 表示模拟交易

## 系统总体架构

```text
binance-futures-bot/
├── app/                     # 前端（Nuxt 4）
├── server/                  # 后端
│   ├── api/                 # 前端调用接口
│   ├── modules/
│   │   └── futures-bot/     # 合约交易机器人核心
│   ├── utils/
│   │   ├── binance.ts       # CCXT Binance Futures 封装
│   │   ├── indicators.ts    # 技术指标
│   │   └── risk.ts          # 风控工具
│   │   └── ai-analysis.ts   # AI分析评分工具
│   └── tasks/               # 定时任务
├── data/                    # 状态配置 & 交易数据持久化
├── logs/                    # 日志
└── types/
```

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
- technicalindicators
- dayjs
- node-cron (看看需要用不)

## AI分析配置

系统集成了DeepSeek AI分析功能，提供智能交易建议。AI配置参数包括：

- **启用AI分析**：是否启用AI分析功能（默认：false）
- **分析间隔**：AI分析执行间隔（默认：10分钟）
- **最小置信度**：AI建议的最小置信度阈值（0-100，默认：60）
- **最大风险等级**：允许的最大风险等级（LOW/MEDIUM/HIGH，默认：MEDIUM）
- **用于开仓决策**：是否将AI分析用于买入决策（默认：true）
- **用于平仓决策**：是否将AI分析用于卖出决策（默认：true）
- **缓存时长**：AI分析结果缓存时间（默认：10分钟）

#### AI分析功能特点
1. **多维度分析**：结合价格变化、移动平均线、RSI、成交量、支撑阻力位等技术指标（technicalindicators）
2. **智能加权**：AI分析结果与本地技术指标加权计算最终置信度
3. **结果缓存**：分析结果自动缓存，减少API调用频率
4. **容错处理**：API调用失败时自动降级，不影响核心交易功能
5. **详细报告**：提供完整的json格式的AI分析理由和技术指标数据（前端需要展示）

## 代码规范
1. 使用TypeScript进行开发，并使用ESLint进行代码规范检查。
2. 模块化组件化开发，易维护，遵循单一职责原则。
3. 使用Pinia进行状态管理，并使用TypeScript进行类型定义。
4. 所有时间使用 dayjs

## 注意事项
1. 代码不要出现错误，请使用TypeScript进行类型检查。
2. vue文件里面不需要引用这个 import { ElMessage } from 'element-plus'
3. 状态管理stores目录放在app目录下
4. 不要出现  不能将类型“string”分配给类型 类似类型的代码报错