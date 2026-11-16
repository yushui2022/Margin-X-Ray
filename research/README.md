# Ground Truth 50

第 1–2 周的唯一目标：用人工把真实爆款的**底价、工厂、证据**采回来，验证商业闭环。这里不放代码，也不放假数据。

## 文件

| 文件 | 用途 |
|---|---|
| `ground-truth-50.csv` | 50 个候选爆款，一行一款。已预填类目与产业带假设，其余留空待采。 |
| `supplier-quotes.csv` | 每个产品最多 3 家供应商的实盘报价与工商核验结果。 |
| `GROUND-TRUTH-SOP.md` | 采集、图搜、电话套价、工商核验、P25/P50/P75 与质检的完整 SOP。 |

CSV 使用 UTF-8 BOM，Excel / Google Sheets 可直接打开。

## 快速开始

1. 打开 `GROUND-TRUTH-SOP.md`，按第 2 节确认 50 款清单。
2. 每人每天 5 款，先填 `ground-truth-50.csv` 的采集字段。
3. 图搜后在 `supplier-quotes.csv` 登记 3 家供应商。
4. 电话套价 + 工商核验，把 `status` 推进到 `VERIFIED`。
5. 复核人按 SOP 第 9 节抽检，然后对外交付报告。

## 状态流转

```text
TODO → CAPTURED → QUOTED → VERIFIED → DELIVERED
```

- `CAPTURED`：链接、价格、商品图、中文搜索词完成
- `QUOTED`：≥1 家真实报价
- `VERIFIED`：≥1 家完成工商核验 + 电话确认
- `DELIVERED`：报告已交付给用户/客户

## 字段字典 — ground-truth-50.csv

| 字段 | 说明 |
|---|---|
| `id` | GT-001 … GT-050 |
| `status` | 状态流转 |
| `category` | 中文类目 |
| `product_name` | 英文商品名 |
| `tiktok_url` | 带货视频链接 |
| `creator_handle` | 达人 handle |
| `retail_price_usd` | 页面零售价（USD） |
| `capture_date` | 采集日期 YYYY-MM-DD |
| `buyer` | 买手 initials |
| `image_ref` | 商品图文件名（放 `research/images/`） |
| `keywords_cn` | 中文搜索词：品类 + 材质/工艺 + 产业带 |
| `cluster_guess` | 产业带假设 |
| `image_provider` | justoneapi / onebound / 1688-open |
| `matches_count` | 图搜召回数量 |
| `p25_usd` / `p50_usd` / `p75_usd` | 清洗后的三档 EXW 单价（USD） |
| `moq_range` | 例如 100/500/2000 |
| `primary_supplier_id` | 对应 supplier-quotes.csv |
| `verified_factory` | yes / no / unknown |
| `confidence` | high / medium / low |
| `notes` | 汇率、剔除原因、规格等 |

## 字段字典 — supplier-quotes.csv

| 字段 | 说明 |
|---|---|
| `supplier_id` | SUP-001 … |
| `product_id` | 关联 GT-xxx |
| `legal_name` | 工商全称 |
| `shop_name` | 1688 店铺名 |
| `location` | 省市区 |
| `established_year` | 成立年份 |
| `insured_employees` | 参保人数 |
| `paid_in_capital_cny` | 实缴资本（CNY） |
| `manufacturing_scope` | 经营范围是否含生产/制造/加工 |
| `disputes_flag` | 失信/被执行/合同纠纷 |
| `factory_or_trader` | factory / trader / hybrid |
| `moq` | 该报价对应起订量 |
| `unit_price_cny` | 含税或未税（notes 注明） |
| `unit_price_usd` | 归一化 EXW USD |
| `incoterm` | EXW / FOB |
| `lead_time_days` | 交期 |
| `packaging_size_cm` | 单件包装尺寸 |
| `weight_kg` | 单件实重 |
| `oem_available` | 能否贴牌 |
| `certifications` | CE/FCC/ROHS 等 |
| `contact_name` / `contact_phone` / `contact_wechat` | 仅内部 |
| `evidence_url` | 报价单/聊天截图/车间视频链接 |
| `verified_by` / `verified_date` | 复核人/日期 |
| `confidence` | high / medium / low |
| `notes` | 口头价、税点、异常说明 |

## 红线

- 没有来源的价格不填，不用“最低价”冒充实盘价。
- 工厂名称、电话、微信只进内部库，不对外发布。
- 对外报告隐藏供应商全名与联系方式。
- 每条记录必须有日期与采集人。
