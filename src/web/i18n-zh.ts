import { priceArchiveZh } from "./i18n-price-archive";
import { shoppingZh, shoppingPhrase } from "./i18n-shopping";
import { toolsZh, toolsPhrase } from "./i18n-tools";

const common: Record<string, string> = {
  "Switch shops and save": "换家店可省",
  "TikTok Shop rankings": "TikTok Shop 价格榜",
  "Tied #1": "并列第 1 名",
  "Retail premium & evidence": "零售溢价与证据",
  "Coverage & sources →": "资料与来源 →",
  "Shopping check": "带货比价", "Rankings": "排行榜", "Creators": "博主", "Price archive": "价格档案",
  "Main navigation": "主导航", "Onion Head home": "Onion Head 首页", "Tools": "工具",
  "Search": "搜索", "Close": "关闭", "Retry": "重试", "Save": "保存", "Back": "返回",
  "Creator directory": "博主名录", "Creator research": "博主研究", "Saved edition": "已收录数据",
  "Checking agent": "正在检查服务", "Agent offline": "服务未连接", "Agent connected": "服务已连接",
  "Mock backend": "演示服务", "Agent backend": "查询服务设置", "Backend": "服务设置",
  "API base URL": "服务地址", "Test connection": "测试连接", "Backend saved.": "已保存服务设置。",
  "Compare supplier prices": "比较供应商报价", "Scan a video or image": "识别视频或图片",
  "Enter a username, display name or TikTok link.": "请输入用户名、昵称或 TikTok 链接。",
  "Enter a TikTok video, creator handle or TikTok Shop product link.": "请输入 TikTok 视频链接、博主账号或 TikTok Shop 商品链接。",
  "Enter a TikTok video, creator handle or TikTok Shop listing.": "请输入 TikTok 视频链接、博主账号或 TikTok Shop 商品链接。",
};
const labels = { ...toolsZh, ...priceArchiveZh, ...shoppingZh, ...common };
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function translateUnit(text: string): string {
  if (Object.hasOwn(labels, text)) return labels[text];
  const localized = shoppingPhrase(text) ?? toolsPhrase(text);
  if (localized !== undefined) return localized;
  const date = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(text);
  if (date) return date[3] + "年" + (months.indexOf(date[1]) + 1) + "月" + date[2] + "日";
  if (text.includes(" · ")) return text.split(" · ").map(translateUnit).join(" · ");
  const arrow = /^(← )?(.+?)( [↗→])?$/.exec(text);
  if (arrow && (arrow[1] || arrow[3])) return (arrow[1] ?? "") + translateUnit(arrow[2]) + (arrow[3] ?? "");
  return text;
}

export function translateChinese(value: string): string {
  if (!/[A-Za-z]/.test(value)) return value;
  const trimmed = value.trim();
  const localized = translateUnit(trimmed.replace(/\s+/g, " "));
  return localized === trimmed.replace(/\s+/g, " ") ? value : value.replace(trimmed, () => localized);
}
