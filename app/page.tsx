"use client";

import { useMemo, useState } from "react";

type Signal = {
  id: string;
  label: string;
  weight: number;
  detail: string;
  pattern: RegExp;
};

const signals: Signal[] = [
  {
    id: "negative",
    label: "差评/口碑翻车",
    weight: 30,
    detail: "总体或近期评价出现明显负面信号。",
    pattern: /mostly negative|overwhelmingly negative|negative|差评|多半差评|口碑翻车/i,
  },
  {
    id: "mixed",
    label: "评价分歧",
    weight: 15,
    detail: "玩家评价分裂，适合等更多评测或折扣。",
    pattern: /mixed|褒贬不一|争议|两极分化/i,
  },
  {
    id: "dlc",
    label: "DLC/微交易",
    weight: 16,
    detail: "可能存在后续付费、内容拆分或长期消费。",
    pattern: /dlc|microtransaction|battle pass|loot box|内购|微交易|战斗通行证|抽箱/i,
  },
  {
    id: "drm",
    label: "第三方账号/DRM",
    weight: 18,
    detail: "额外启动器、账号绑定或 DRM 会增加售后摩擦。",
    pattern: /denuvo|ubisoft|ea app|rockstar|third-party|3rd-party|drm|第三方账号|启动器/i,
  },
  {
    id: "early",
    label: "抢先体验",
    weight: 12,
    detail: "内容完整度和更新节奏需要额外确认。",
    pattern: /early access|抢先体验|路线图|roadmap/i,
  },
  {
    id: "online",
    label: "联网服务风险",
    weight: 12,
    detail: "服务器、外挂、停服和匹配体验会影响长期价值。",
    pattern: /online only|server|matchmaking|anti-cheat|联网|服务器|停服|外挂/i,
  },
  {
    id: "ai",
    label: "AI 内容争议",
    weight: 10,
    detail: "AI 生成内容可能影响素材质量和社区接受度。",
    pattern: /ai-generated|generative ai|ai content|ai 生成|人工智能生成/i,
  },
];

const sampleText =
  "Black Flag Resynced launches to Mostly Negative reviews. Players complain about Ubisoft Connect, pricing, DLC, and a recent update causing performance issues.";

function getLevel(score: number) {
  if (score >= 70) return { label: "高风险", tone: "danger", action: "不建议原价买" };
  if (score >= 45) return { label: "谨慎", tone: "warn", action: "等折扣或看 Reddit" };
  if (score >= 20) return { label: "轻度注意", tone: "watch", action: "看近期差评再决定" };
  return { label: "低风险", tone: "ok", action: "可加入愿望单观察" };
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Home() {
  const [game, setGame] = useState("Assassin's Creed Black Flag Resynced");
  const [text, setText] = useState(sampleText);
  const [visitors, setVisitors] = useState(24000);
  const [freeRate, setFreeRate] = useState(9);
  const [paidRate, setPaidRate] = useState(4);
  const [price, setPrice] = useState(5);

  const report = useMemo(() => {
    const hits = signals.filter((signal) => signal.pattern.test(`${game} ${text}`));
    const score = Math.min(100, hits.reduce((sum, signal) => sum + signal.weight, 0));
    return { hits, score, level: getLevel(score) };
  }, [game, text]);

  const revenue = useMemo(() => {
    const installs = Math.round(visitors * (freeRate / 100));
    const subscribers = Math.round(installs * (paidRate / 100));
    return {
      installs,
      subscribers,
      monthly: subscribers * price,
      yearly: subscribers * price * 12,
    };
  }, [visitors, freeRate, paidRate, price]);

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Steam Guardrail App</p>
          <h1>买游戏前，先看玩家在骂什么。</h1>
          <p className="subcopy">
            一个面向 Steam 玩家和独立游戏开发者的消费避坑与口碑情报工具。
            免费版负责传播，Pro 版负责总结、监控和变现。
          </p>
        </div>
        <div className="hero-metrics" aria-label="商业化指标概览">
          <div>
            <span>{currency(revenue.monthly)}</span>
            <small>模拟月收入</small>
          </div>
          <div>
            <span>{revenue.subscribers.toLocaleString()}</span>
            <small>付费用户</small>
          </div>
          <div>
            <span>{report.score}</span>
            <small>当前风险分</small>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel" aria-label="分析输入">
          <div className="panel-heading">
            <p>Risk Scanner</p>
            <h2>游戏消费避坑分析</h2>
          </div>

          <label className="field">
            <span>游戏名</span>
            <input value={game} onChange={(event) => setGame(event.target.value)} />
          </label>

          <label className="field">
            <span>粘贴 Steam 页面、评论或 Reddit 抱怨</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>

          <div className="quick-actions">
            <button type="button" onClick={() => setText(sampleText)}>
              载入样例
            </button>
            <button type="button" onClick={() => setText("")}>
              清空
            </button>
          </div>
        </aside>

        <section className={`report-card ${report.level.tone}`} aria-label="风险报告">
          <div className="score-row">
            <div>
              <p>Purchase Verdict</p>
              <h2>{report.level.action}</h2>
            </div>
            <div className="score-badge">{report.score}</div>
          </div>
          <div className="meter">
            <span style={{ width: `${report.score}%` }} />
          </div>
          <div className="verdict">
            <strong>{report.level.label}</strong>
            <span>
              {report.hits.length
                ? `命中 ${report.hits.length} 个风险信号，适合先看 Reddit 和近期差评。`
                : "暂未命中明显风险，可以加入愿望单继续监控。"}
            </span>
          </div>

          <div className="signals-grid">
            {report.hits.length ? (
              report.hits.map((signal) => (
                <article key={signal.id} className="signal-card">
                  <strong>{signal.label}</strong>
                  <span>{signal.detail}</span>
                </article>
              ))
            ) : (
              <article className="signal-card">
                <strong>没有明显红旗</strong>
                <span>免费版可以给出基础判断，Pro 版负责持续监控变化。</span>
              </article>
            )}
          </div>
        </section>
      </section>

      <section className="business-grid">
        <article className="pro-card">
          <div className="panel-heading">
            <p>Pro Offer</p>
            <h2>付费版卖什么</h2>
          </div>
          <ul>
            <li>AI 总结 Reddit、Steam 差评和 YouTube 评论里的核心抱怨</li>
            <li>愿望单监控：降价时同时提醒近期差评是否暴涨</li>
            <li>DLC 总价、历史低价、DRM、AI 内容披露一屏看懂</li>
            <li>“买 / 等打折 / 别买”结论和证据链接</li>
          </ul>
          <div className="price-row">
            <span>$5/月</span>
            <small>或 $29/年，适合重度 Steam 玩家</small>
          </div>
        </article>

        <article className="watchlist-card">
          <div className="panel-heading">
            <p>Watchlist</p>
            <h2>愿望单监控样例</h2>
          </div>
          <div className="watch-item">
            <span>Space Colony Remake</span>
            <strong>降价 55%，但服务器差评上升</strong>
          </div>
          <div className="watch-item">
            <span>Mecha Chameleon</span>
            <strong>低风险，历史低价附近</strong>
          </div>
          <div className="watch-item">
            <span>Pirate Legends DLC Pack</span>
            <strong>DLC 总价超过本体 3.2x</strong>
          </div>
        </article>

        <article className="calculator-card">
          <div className="panel-heading">
            <p>Revenue Simulator</p>
            <h2>收入测算</h2>
          </div>
          <div className="slider-list">
            <label>
              <span>月访问量 {visitors.toLocaleString()}</span>
              <input
                type="range"
                min="2000"
                max="100000"
                step="1000"
                value={visitors}
                onChange={(event) => setVisitors(Number(event.target.value))}
              />
            </label>
            <label>
              <span>安装转化 {freeRate}%</span>
              <input
                type="range"
                min="1"
                max="25"
                value={freeRate}
                onChange={(event) => setFreeRate(Number(event.target.value))}
              />
            </label>
            <label>
              <span>付费转化 {paidRate}%</span>
              <input
                type="range"
                min="1"
                max="15"
                value={paidRate}
                onChange={(event) => setPaidRate(Number(event.target.value))}
              />
            </label>
            <label>
              <span>月费 ${price}</span>
              <input
                type="range"
                min="3"
                max="12"
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="revenue-box">
            <div>
              <span>{revenue.installs.toLocaleString()}</span>
              <small>免费安装</small>
            </div>
            <div>
              <span>{currency(revenue.yearly)}</span>
              <small>年化收入</small>
            </div>
          </div>
        </article>
      </section>

      <section className="funnel">
        <div className="panel-heading">
          <p>Go To Market</p>
          <h2>冷启动变现路径</h2>
        </div>
        <div className="funnel-steps">
          <div>
            <span>1</span>
            <strong>免费插件</strong>
            <p>在 Reddit、Steam 社区、B 站用“差评避坑榜”引流。</p>
          </div>
          <div>
            <span>2</span>
            <strong>Pro 订阅</strong>
            <p>把 AI 总结、愿望单监控、历史低价做成付费功能。</p>
          </div>
          <div>
            <span>3</span>
            <strong>B2B 报告</strong>
            <p>给独立游戏开发者卖竞品差评和玩家抱怨分析。</p>
          </div>
        </div>
      </section>
    </main>
  );
}
