# POI 数据采集与整合方案

## 结论

目标字段可以落库，但不建议、也不应通过未授权的大规模抓取大众点评页面来获得 2000 万级商家 POI。当前方案把工作拆成三层：

1. 数据来源合规化：采购有授权的数据、平台开放接口、商家授权导出、自有采集、公开可复用数据。
2. 数据结构标准化：把不同来源映射到统一的 `restaurant`、`dish`、`tag`、`restaurant_tag`、`dish_tag`。
3. 数据质量工程化：校验、去重、地理范围检查、字段覆盖率报告、增量更新和可追溯来源。

## 不做的事

- 绕过验证码、登录限制、风控、字体反爬、接口签名、设备指纹或访问频控。
- 使用代理池、住宅 IP、Cookie 池批量规避平台限制。
- 抓取未授权评论、用户主页、用户关系链等可能包含个人信息的数据。

## 可做的事

- 对已授权 URL 或自有站点做 robots 检查、速率限制、断点续跑和页面解析测试。
- 对采购/授权/开放 API 数据做标准化导入。
- 设计 2000 万级 POI 数据的分区、索引、质量评估和更新策略。
- 对样例字段进行自动校验并导出 JSONL，方便后续入库到 PostgreSQL、ClickHouse、DuckDB 或对象存储。

## 字段映射

| 原始字段 | 标准字段 | 说明 |
| --- | --- | --- |
| shopuuid | source_shop_uuid | 来源平台商家 UUID |
| shopid | source_shop_id | 来源平台商家 ID |
| 店铺标签 | tags | 店铺榜单、年限、属性标签 |
| 省份 | province | 省份 |
| 城市 | city | 城市 |
| 区域 | district | 区县/商圈 |
| 店铺评分星级 | rating | 0-5 分 |
| 店铺总评论数量 | review_count | 评论量，不采集评论正文 |
| 经纬度_lat | latitude | 纬度 |
| 经纬度_lng | longitude | 经度 |
| 店铺名字 | name | 商家名称 |
| 评分详情 | rating_details | 口味、环境、服务等 |
| 人均 | avg_price_cny | 人均消费，人民币数值 |
| 小类 | sub_category | 细分类目 |
| 大类 | primary_category | 一级类目 |
| 是否海外店铺 | is_overseas | 布尔值 |
| 是否外卖 | delivery_supported | 布尔值 |
| 菜单1 | dishes.name | 菜品名称列表 |
| 菜单2 | dishes detail | 菜品名称、推荐数、图片链接 |

## 推荐数据源路线

1. 短期验证：使用 1-3 个城市的已授权样本或采购样本，先跑字段覆盖率、去重率和坐标质量。
2. 中期扩展：接入商家授权上传、开放平台接口或第三方合规供应商，建立来源凭证字段。
3. 长期生产：按省市区分区存储，保留 `source_platform`、`source_license`、`ingested_at`、`updated_at` 和原始行哈希，便于审计和更新。

## 爬虫测试要求

只对自有或授权站点执行：

- 先检查 robots.txt。
- 明确 User-Agent 和联系邮箱。
- 设置站点级速率限制，默认不低于 3 秒一次请求。
- 记录请求、响应状态、解析版本和页面哈希。
- 仅采集必要字段，不采集用户个人信息。
- 失败重试要有上限，并使用指数退避。

本仓库提供：

- `npm run data:normalize`：把授权样例数据标准化为 JSONL。
- `npm run data:robots -- --url=https://example.com/restaurants`：检查授权目标 URL 的 robots 规则。
- `npm run data:smoke -- --url=https://example.com/restaurants`：对自有或授权页面做一次轻量抓取测试，记录状态码、标题、页面哈希和 robots 决策。

## 后续入库建议

- 小规模分析：DuckDB + Parquet。
- 线上查询：PostgreSQL/PostGIS，按城市和经纬度建索引。
- 2000 万级离线分析：ClickHouse 或 Parquet 湖仓。
- 推荐服务：先从 `restaurant` 和 `dish` 建宽表，再按位置、预算、类目、标签做召回。
