# 🍜 吃啥 Chi-Sha

> 一个会看心情、记住偏好、照顾生活质感的 AI 饭饭决策助手。  
> 少一点“今天到底吃什么”的拉扯，多一点“好好吃饭”的小确定。

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=fff)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=fff)
![AI](https://img.shields.io/badge/AI_Food_Mood_Engine-on-DA7756?style=flat-square)

## 🌷 小小开场

“吃啥”不是一个冷冰冰的随机菜名生成器。

它更像一个放在手机里的生活小助手：知道你现在是早餐、午餐、晚餐还是夜宵；知道你今天是想奖励自己、想吃热乎的、减脂期，还是单纯没食欲；也能参考你最近吃过什么、拒绝过什么、附近大概有什么，温柔但果断地帮你把这一餐定下来。

项目目前是一套基于 Next.js App Router 的 Web App，包含 AI 推荐、心情筛选、位置感知、拍照识别食材、我的菜单、饮食日记、账号同步、饮食日记海报导出，以及真实餐厅菜品数据库的合规数据接入雏形。

## ✨ 产品气质

这份 App 的用户画像更偏向重视审美、效率、身体感受与生活质量的城市女性用户。她们不一定需要复杂的营养系统，也不想被“必须自律”“必须完美饮食”绑架；她们真正想要的是：

- 👜 下班后少做一道选择题。
- 🍰 想奖励自己时，不用为快乐感到心虚。
- 🥗 减脂期也能被认真对待，而不是只被推荐冷冰冰的沙拉。
- 🥬 家里有食材时，能快速变成一顿真实可做的饭。
- 📔 把吃过的饭记录下来，像记录生活，而不是像填表。
- 🎀 页面要可爱，但不能幼稚；要温暖，但不能油腻；要精致，但不能难用。

所以“吃啥”的设计语言是暖纸感、圆润、松弛、轻生活方式。它的语气不是命令式的“你应该吃”，而是轻轻推你一下：

> 别再和选择题拉扯了，今天就让它落地。

## 🍱 现在它能做什么

### 1. 🍚 今天吃啥

首页是项目的核心决策流。用户可以选择：

- 餐段：早餐、午餐、晚餐、夜宵、奶茶。
- 状态：奖励自己、摆烂、减脂期、想吃热乎的、想吃凉快的、没食欲、emo。
- 类型：中餐、韩餐、日料、西餐、快餐、甜点、随便。
- 位置：通过浏览器定位 + 高德 Web Service 获取城市、区县、附近餐饮 POI。

点击“帮我决定”后，`/api/recommend` 会结合这些信息生成一个菜品和理由。推荐结果经过本地菜品池校验，避免 AI 随口编出奇怪菜名，也会尽量避开最近吃过或已经拒绝过的食物。

如果用户不想思考，也可以点“转盘盲盒模式”。它会从我的菜单、饮食日记和扩展菜品池中加权抽取一道，给出一个更轻快的答案。

### 2. 🧠 AI 推荐不是纯随机

推荐接口会参考：

- 当前真实时间与用户选择的餐段。
- 用户状态和菜系偏好。
- 最近喜欢、拒绝、吃过的食物。
- 上一次推荐结果，避免“换一换”还换回同一道。
- 所在城市、区县、街道和附近餐饮服务 POI。
- 城市常见供给，例如地域菜品候选。

代码里还写了不少“生活化约束”：

- 想吃凉快的，就避免火锅、麻辣烫、热汤面、重油重辣。
- 没食欲时，优先推荐粥、蒸蛋、清汤、小份面、清淡类。
- 减脂期时，避免高糖、高油、炸物，奶茶场景也会优先低糖。
- 早餐不推荐火锅、烧烤、烤肉这类晚餐食物。
- 定位的目的不是强行推荐本地特色，而是提高“附近真实吃得到”的概率。

### 3. 📝 我的菜单

“我的菜单”是一面属于用户自己的菜墙。

用户可以把自己会做、常吃、想做的菜加进去，例如番茄炒蛋、红烧排骨、菌菇鸡汤面、虾仁糙米饭。之后做饭 AI 会优先从这里挑选，而不是凭空创造一道用户完全不会做的菜。

支持能力：

- 添加菜品。
- 删除菜品。
- 默认家常菜菜单。
- 展开/收起菜单墙。
- 从菜单中生成今天适合做什么。

### 4. 📸 拍照识别食材

在“我的菜单”页里，用户可以拍冰箱、案板或现有食材。图片会先在浏览器端压缩，再提交到 `/api/identify`。

识别结果会区分三种情况：

- `ingredient`：识别到食材，例如番茄、鸡蛋、青菜。
- `dish`：识别到成品菜或餐食，并拆出主要食材。
- `non_food`：不是食物或画面不够明确。

如果识别到了可用食材，系统会给出最多 3 个“清库存家常菜”建议，并且可以继续交给做饭 AI 生成简明菜谱。

### 5. 🍳 做饭 AI

`/api/cook` 是一个偏家常的菜谱决策引擎。

它有两种模式：

- 从“我的菜单”里挑一道今天适合做的菜。
- 根据拍照识别到的食材，生成一道能现实做出来的家常菜。

返回结构包括：

- `dish`：菜名。
- `reason`：为什么现在适合做它。
- `ingredients`：3-8 项常见食材或调料。
- `steps`：3-6 步短步骤。
- `tips`：一句实用提醒。

它的目标不是写一篇复杂菜谱，而是让普通人可以马上动手，少洗锅、少纠结、能吃上热乎饭。

### 6. 💡 灵感墙

灵感页不是直接推荐菜名，而是生成“今天适合的饮食方向”。

例如：

- 适合加班后的热乎晚餐。
- 适合没食欲时的一点清爽。
- 适合奖励自己的晚餐。
- 适合深夜的轻负担选择。

用户也可以手动添加自己的灵感，或者用浏览器语音识别快速记一句想法。这个区域更偏生活方式，帮助用户从“我不知道吃什么”过渡到“我大概知道今天想要什么感觉”。

### 7. 📔 饮食日记

每次用户接受推荐，系统都会把这顿饭记录到饮食日记里。

记录内容包括：

- 餐段。
- 心情/状态。
- 菜系或来源。
- 菜名。
- 时间和时区。
- 喜欢或拒绝。
- 可选照片。

饮食日记按本周、本月、更早分组展示，也会生成一些轻量洞察。例如最近总在深夜打开 App、最近没食欲、最近很会奖励自己等。

### 8. 🖼️ 带照片确认与日记海报

用户接受推荐时，可以上传这顿饭的照片。图片会在浏览器端压缩，并保存到 IndexedDB。

饮食日记支持导出成一张分享图，使用 `html2canvas` 渲染：

- 统计记录了几顿。
- 统计有多少张照片。
- 按时间阶段展示食物记录。
- 生成适合分享的生活化视觉海报。

这让“吃饭记录”更像一本轻量生活手账，而不是严肃数据表。

### 9. ☁️ 账号同步

项目内置了一个轻量账号同步能力：

- 未登录时，数据默认存储在当前浏览器。
- 登录时，用户输入账号名 + 同步口令。
- 系统会用账号和口令生成同步 key。
- 通过 Vercel KV 或 Upstash Redis 保存菜单、饮食日记和部分照片。

这不是完整的商业账号系统，更像 MVP 阶段的轻量云同步。生产环境建议接入正式鉴权、加密和更细的数据权限策略。

## 🗺️ 页面地图

| 页面 | 入口 | 主要能力 |
| --- | --- | --- |
| 🍚 今天吃啥 | `today` | AI 推荐、位置、心情筛选、转盘盲盒、接受/拒绝、带照片确认 |
| 📝 我的菜单 | `menu` | 菜单管理、拍照识别食材、做饭 AI、简明菜谱 |
| 💡 灵感 | `discover` | AI 灵感、随机灵感、手动灵感、语音输入 |
| 📔 饮食日记 | `recent` | 饮食记录、统计、照片、详情弹层、导出分享图 |

## 🛠️ 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Next.js 16 App Router |
| UI | React 19 |
| 样式 | Tailwind CSS 4 + 自定义暖食帖设计 tokens |
| 动效 | Framer Motion |
| 图标 | lucide-react |
| Toast | sonner |
| AI SDK | openai |
| 数据校验 | zod |
| 图片压缩 | browser-image-compression |
| 分享图导出 | html2canvas |
| 本地照片 | IndexedDB |
| 本地偏好 | localStorage |
| 云同步 | Vercel KV / Upstash Redis REST API |
| 定位 | Browser Geolocation + 高德 Web Service API |

## 🚀 快速开始

### 1. 📦 克隆项目

```bash
git clone https://github.com/MissRui1/chi-sha.git
cd chi-sha
```

### 2. 🧺 安装依赖

建议使用 Node.js 20+。

```bash
npm install
```

### 3. 🔐 配置环境变量

在项目根目录创建 `.env.local`：

```bash
# AI 基础配置
AI_API_KEY=your_ai_api_key
AI_BASE_URL=https://api.openai-next.com/v1
AI_MODEL=gemini-3.1-flash-image-preview
RECOMMEND_AI_MODEL=qwen3-max

# 高德定位，可选但推荐配置
AMAP_WEB_SERVICE_KEY=your_amap_web_service_key

# 云同步，可选
KV_REST_API_URL=your_vercel_kv_or_upstash_url
KV_REST_API_TOKEN=your_vercel_kv_or_upstash_token
```

### 4. 🍲 启动开发服务

```bash
npm run dev
```

打开浏览器访问：

```text
http://localhost:3000
```

### 5. 🏗️ 构建生产版本

```bash
npm run build
npm run start
```

### 6. ✅ 代码检查

```bash
npm run lint
```

## 🔑 环境变量说明

| 变量 | 必填 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `AI_API_KEY` | AI 功能必填 | 无 | OpenAI 兼容接口密钥 |
| `DASHSCOPE_API_KEY` | 否 | 无 | 兼容旧配置；没有 `AI_API_KEY` 时作为 fallback |
| `AI_BASE_URL` | 否 | `https://api.openai-next.com/v1` | OpenAI 兼容 API 地址 |
| `AI_MODEL` | 否 | `gemini-3.1-flash-image-preview` | 灵感、做饭、识图等通用 AI 模型 |
| `RECOMMEND_AI_MODEL` | 否 | `qwen3-max` | 今日推荐专用模型 |
| `AMAP_WEB_SERVICE_KEY` | 定位功能必填 | 无 | 高德 Web Service Key |
| `GAODE_WEB_SERVICE_KEY` | 否 | 无 | 高德 key 兼容变量 |
| `AMAP_KEY` | 否 | 无 | 高德 key 兼容变量 |
| `KV_REST_API_URL` | 云同步必填 | 无 | Vercel KV / Upstash REST URL |
| `KV_REST_API_TOKEN` | 云同步必填 | 无 | Vercel KV / Upstash REST Token |
| `UPSTASH_REDIS_REST_URL` | 否 | 无 | Upstash 兼容变量 |
| `UPSTASH_REDIS_REST_TOKEN` | 否 | 无 | Upstash 兼容变量 |

没有配置 AI key 时，页面仍可打开，但 AI 推荐、识图、灵感和做饭接口会失败。  
没有配置高德 key 时，定位功能不可用，但用户仍可以手动使用推荐。  
没有配置 KV / Upstash 时，账号同步不可用，但本地饮食日记和菜单仍能正常保存。

## 🧩 API 一览

| 路由 | 方法 | 作用 |
| --- | --- | --- |
| `/api/recommend` | `POST` | 根据餐段、心情、菜系、位置和历史记录生成今日推荐 |
| `/api/cook` | `POST` | 从用户菜单或识别食材中生成家常菜建议 |
| `/api/identify` | `POST` | 识别图片中的食材、成品菜或非食物 |
| `/api/inspiration` | `POST` | 生成饮食灵感方向 |
| `/api/location` | `GET` | 通过 IP 获取城市级定位 |
| `/api/location` | `POST` | 通过经纬度调用高德逆地理编码 |
| `/api/sync` | `POST` | 拉取或保存账号同步数据 |

## 🫙 数据如何保存

### 🏠 浏览器本地

| 数据 | 存储方式 |
| --- | --- |
| 匿名用户 ID | `localStorage` |
| 当前账号 session | `localStorage` |
| 我的菜单 | `localStorage` |
| 饮食日记文字记录 | `localStorage` |
| 饭菜照片 | `IndexedDB` |

### ☁️ 云同步

云同步接口会保存：

- `memory`：饮食日记。
- `myMenu`：我的菜单。
- `photos`：最多 24 张压缩后的日记照片。
- `updatedAt`：最近更新时间。

同步数据大小做了限制，避免一次性把太大的图片数据塞进 KV。

### 🖼️ 图片处理

上传图片会在浏览器端通过 `browser-image-compression` 压缩：

- 最大宽高：约 800px。
- 最大体积：约 0.8MB。
- 输出格式：JPEG。

拍照识别时，压缩后的图片会发送给 AI 服务商进行识别。饮食日记照片默认优先保存在本地 IndexedDB；登录同步时才会尝试同步部分照片。

## 🗂️ 目录结构

```text
chi-sha/
├─ app/
│  ├─ api/
│  │  ├─ cook/route.ts          # 做饭 AI
│  │  ├─ identify/route.ts      # 食材/菜品识别
│  │  ├─ inspiration/route.ts   # 饮食灵感生成
│  │  ├─ location/route.ts      # 高德定位
│  │  ├─ recommend/route.ts     # 今日吃啥推荐
│  │  └─ sync/route.ts          # 云同步
│  ├─ globals.css               # 暖食帖视觉系统
│  ├─ layout.tsx                # 根布局、字体、Toaster
│  └─ page.tsx                  # 主应用界面
├─ data/
│  ├─ samples/                  # 授权样例数据
│  └─ sources.example.json      # 数据源配置示例
├─ docs/
│  └─ poi-data-acquisition-plan.md
├─ lib/
│  ├─ ai.ts                     # AI 客户端与模型配置
│  ├─ dish-database.ts          # 菜品池、地域菜、奶茶池、菜名校验
│  ├─ image.ts                  # 浏览器图片压缩
│  ├─ photo-store.ts            # IndexedDB 照片存储
│  ├─ prompt-harness.ts         # JSON Prompt 校验与重试
│  ├─ share.ts                  # 饮食日记海报导出
│  └─ user.ts                   # 用户 ID 与轻量账号 session
├─ scripts/
│  ├─ fetch-smoke.mjs           # 授权页面轻量抓取测试
│  ├─ poi-normalize.mjs         # POI 样例数据标准化
│  ├─ robots-check.mjs          # robots 检查
│  └─ robots-lib.mjs            # robots 解析工具
├─ REAL_RESTAURANT_DISH_DATABASE.md
└─ README.md
```

## 🎨 设计语言：暖食帖 Warm Table

项目的 UI 不是常见后台风，也不是高饱和外卖风。它更接近“温暖生活工具”：

- 背景：暖奶油纸感。
- 主色：森林绿、陶土橘、蜂蜜黄、鼠尾草绿。
- 字体：中文圆润展示字体 + 易读正文字体。
- 卡片：圆润但不浮夸。
- 动效：轻微上浮、转盘旋转、渐入，不打扰用户。
- 图片：真实食物照片作为情绪锚点。

设计目标是：第一眼可爱，第二眼可信，长期使用不疲劳。

### 🖋️ 文案原则

适合继续维护这个项目时参考：

- 不审判用户吃什么。
- 不制造身材焦虑。
- 不把“减脂期”写成惩罚。
- 不对 emo、摆烂、没食欲做说教。
- 不用过度文艺的句子压住功能。
- 少说“你必须”，多说“今天可以”。
- 推荐要给理由，但理由要短、真实、像人话。

## 🏙️ 真实餐厅菜品数据库方向

仓库里包含 `REAL_RESTAURANT_DISH_DATABASE.md` 和 `docs/poi-data-acquisition-plan.md`，说明项目后续不只想停留在抽象菜名推荐，而是希望接入真实餐厅、真实菜品、真实价格、距离、评分、营业状态和购买入口。

理想推荐结果会从：

```text
今天吃：宫保鸡丁
```

升级为：

```text
今天吃：宫保鸡丁
餐厅：某某川菜馆
价格：28 元
距离：850m
评分：4.7
状态：营业中，可外卖
```

### 🛡️ 合规原则

项目明确不建议、也不应该通过未授权的大规模抓取来获得平台数据。

推荐来源包括：

- 平台开放接口。
- 商家授权录入。
- 自有采集。
- 用户上传后审核。
- 第三方合法数据服务。
- 已获得授权的数据文件。

项目提供的脚本只用于授权数据或自有站点：

```bash
npm run data:normalize
npm run data:robots -- --url=https://example.com/restaurants
npm run data:smoke -- --url=https://example.com/restaurants
```

### 📏 数据标准化

`npm run data:normalize` 会读取样例 POI 文件：

```text
data/samples/dianping-food-poi-sample.json
```

并输出：

```text
data/out/restaurants.jsonl
data/out/dishes.jsonl
data/out/report.json
```

这为后续导入 PostgreSQL / PostGIS、ClickHouse、DuckDB 或 Parquet 数据湖做准备。

## 💕 适合的使用场景

| 场景 | App 怎么帮忙 |
| --- | --- |
| 👜 下班后脑袋空空 | 用心情 + 餐段直接生成推荐 |
| 🍰 想奖励自己 | 推荐更有满足感的晚餐方向 |
| 🥗 减脂期 | 优先低负担选择，避开高油高糖 |
| 🥬 冰箱有菜但不知道做什么 | 拍照识别食材，生成清库存菜谱 |
| 🔁 最近吃太重复 | 根据历史记录减少重复推荐 |
| 📔 想记录生活 | 把每顿饭存成饮食日记 |
| 🖼️ 想发朋友圈 | 导出一张饮食日记分享图 |
| ☁️ 多设备使用 | 用账号 + 同步口令同步菜单和日记 |

## 🧭 推荐开发路线

### 🌱 近期可以继续完善

- 增加截图或动图，让 README 更直观。
- 给推荐结果增加真实餐厅卡片。
- 加入预算筛选，例如 20 元内、30-50 元、50 元以上。
- 增加忌口设置，例如不吃香菜、不吃辣、乳糖不耐。
- 增加“一人食 / 两人食 / 家庭餐”场景。
- 对饮食日记做月度总结。
- 给图片识别增加更清晰的错误提示。

### 🌿 中期可以尝试

- 接入正式账号系统。
- 对云同步数据做端到端加密。
- 增加真实商家菜品索引。
- 增加附近可点餐品召回。
- 支持 PWA 安装到手机桌面。
- 增加用户自定义心情标签。
- 增加推荐解释，例如“为什么不是火锅”。

### 🌳 长期方向

- 从“今天吃啥”升级为城市女性的一人食生活助手。
- 从菜名推荐升级为真实可消费餐品推荐。
- 从饮食日记升级为轻量生活手账。
- 从 AI 问答升级为多源数据 + 用户偏好 + 位置供给的推荐系统。

## 🔒 隐私与安全提示

当前项目适合原型验证和个人/小团队迭代。若要上线给真实用户，需要额外注意：

- 同步口令不是完整账号体系，不应等同于正式登录鉴权。
- 账号 session 目前会保存在浏览器 `localStorage`。
- 拍照识别会把压缩后的图片发送给 AI 服务商。
- 高德定位只在用户授权后使用浏览器经纬度；失败时可退回 IP 城市级定位。
- 云同步会保存用户菜单、饮食日记和部分照片，需要明确告知用户。
- 生产环境建议增加隐私协议、数据删除能力、加密存储和更严格的访问控制。

## 🧑‍💻 开发注意事项

- AI 接口统一通过 `lib/ai.ts` 创建 OpenAI 兼容客户端。
- AI 输出统一尽量走 `runJsonPrompt`，用 Zod schema 校验结构。
- 推荐菜品会通过 `dish-database.ts` 做菜名池校验，避免模型乱编。
- 位置推荐不要编造具体店名、商圈、营业状态或配送承诺。
- 数据采集脚本只用于授权数据源，不要用于绕过平台限制。
- 页面大部分状态目前集中在 `app/page.tsx`，后续复杂度继续上升时建议拆分组件和 hooks。

## 🧾 常用命令

```bash
# 本地开发
npm run dev

# 生产构建
npm run build

# 启动生产服务
npm run start

# ESLint
npm run lint

# 标准化授权 POI 样例数据
npm run data:normalize

# 检查授权目标 robots
npm run data:robots -- --url=https://example.com/restaurants

# 对授权页面做轻量抓取冒烟测试
npm run data:smoke -- --url=https://example.com/restaurants
```

## 🤝 贡献建议

欢迎从这些方向切入：

- UI 细节：让页面更像一个可长期使用的生活工具。
- 推荐规则：补充更多餐段、心情和饮食偏好的约束。
- 数据能力：完善真实餐厅和真实菜品的数据模型。
- 隐私安全：增强同步、照片、定位相关的数据保护。
- 移动端体验：优化拍照、分享、PWA 和触控交互。
- 测试覆盖：给 API schema、推荐校验、数据标准化脚本补测试。

提交 PR 时建议说明：

- 改了哪个用户场景。
- 是否影响 AI prompt 或推荐规则。
- 是否新增环境变量。
- 是否影响用户本地数据结构。
- 是否涉及定位、图片、同步等隐私数据。

## 🥢 一句话总结

吃啥 Chi-Sha 是一个把“今天吃什么”这件小事认真对待的 AI 生活应用：它可爱，但不是玩具；温柔，但能做决定；精致，但仍然务实。它想帮用户把每一天最普通的一餐，变成更轻松、更确定、更像生活本身的时刻。
