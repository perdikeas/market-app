import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const BULLISH_WORDS = [
  'surge', 'rally', 'beat', 'beats', 'record', 'upgrade', 'growth',
  'profit', 'gain', 'rise', 'rises', 'soars', 'bullish', 'buy',
  'outperform', 'strong', 'positive', 'high', 'boom', 'jump', 'jumps',
  'exceeds', 'above', 'breakthrough', 'milestone', 'optimistic', 'confident'
]

const BEARISH_WORDS = [
  'crash', 'fall', 'falls', 'miss', 'misses', 'downgrade', 'loss',
  'warning', 'risk', 'drop', 'drops', 'plunge', 'bearish', 'sell',
  'underperform', 'weak', 'negative', 'low', 'bust', 'decline', 'declines',
  'below', 'disappoints', 'concern', 'fears', 'cut', 'layoff', 'lawsuit'
]

function computeSentiment(headlines, change) {
  let newsScore = 0
  if (headlines && headlines.length > 0) {
    let total = 0
    headlines.forEach(h => {
      const text = h.toLowerCase()
      let score = 0
      BULLISH_WORDS.forEach(w => { if (text.includes(w)) score++ })
      BEARISH_WORDS.forEach(w => { if (text.includes(w)) score-- })
      total += score
    })
    const avg = total / headlines.length
    newsScore = avg * 150
  }

  // Price momentum score — weight it heavily
  const momentumScore = (change || 0) * 8

  // Combine: 50% news, 50% momentum
  const combined = (newsScore * 0.5) + (momentumScore * 0.5)
  return Math.max(-100, Math.min(100, combined))
}

function getLabel(score) {
  if (score > 60) return { label: 'Strong Buy', color: '#22c55e' }
  if (score > 20) return { label: 'Buy', color: '#4ade80' }
  if (score > -20) return { label: 'Neutral', color: '#facc15' }
  if (score > -60) return { label: 'Sell', color: '#f87171' }
  return { label: 'Strong Sell', color: '#ef4444' }
}

function getDistribution(score, change) {
  let buy = 33, neutral = 34, sell = 33
  if (score > 40 && change > 1) { buy = 65; neutral = 20; sell = 15 }
  else if (score > 20) { buy = 50; neutral = 30; sell = 20 }
  else if (score < -40 && change < -1) { buy = 15; neutral = 20; sell = 65 }
  else if (score < -20) { buy = 20; neutral = 30; sell = 50 }
  return { buy, neutral, sell }
}

function SentimentGauge({ score }) {
  const { label, color } = getLabel(score)
  const needleAngle = (score / 100) * 90

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="-30 -20 320 200" className="w-full h-48">
        <path d="M 23 130 A 107 107 0 0 1 54 54" stroke="#ef4444" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M 54 54 A 107 107 0 0 1 130 23" stroke="#f87171" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M 130 23 A 107 107 0 0 1 206 54" stroke="#facc15" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M 206 54 A 107 107 0 0 1 237 130" stroke="#4ade80" strokeWidth="14" fill="none" strokeLinecap="round" />

        <g transform={`rotate(${needleAngle}, 130, 130)`}>
          <line x1="130" y1="130" x2="130" y2="35" stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="130" cy="130" r="6" fill="white" />

        <text x="40" y="38" fill="#f87171" fontSize="9" textAnchor="middle">Sell</text>
        <text x="130" y="5" fill="#facc15" fontSize="9" textAnchor="middle">Neutral</text>
        <text x="220" y="38" fill="#4ade80" fontSize="9" textAnchor="middle">Buy</text>
        <text x="-10" y="148" fill="#ef4444" fontSize="9" textAnchor="middle">Strong</text>
        <text x="-10" y="159" fill="#ef4444" fontSize="9" textAnchor="middle">Sell</text>
        <text x="270" y="148" fill="#22c55e" fontSize="9" textAnchor="middle">Strong</text>
        <text x="270" y="159" fill="#22c55e" fontSize="9" textAnchor="middle">Buy</text>
      </svg>
      <p className="text-lg font-bold mt-1" style={{ color }}>{label}</p>
    </div>
  )
}

async function fetchCandles(symbol) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/candles?symbol=${encodeURIComponent(symbol)}`)
  return await response.json()
}

async function fetchNewsAndQuote(symbol) {
  const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/news/${encodeURIComponent(cleanSymbol)}`)
  return await response.json()
}

async function generateTraderTalk(symbol, price, change, sentimentLabel, headlines, chartData) {
  const priceHistory = chartData.slice(-7).map(d => `${d.date}: $${d.price}`).join(', ')
  const headlinesSummary = headlines.slice(0, 5).map(h => h.headline).join('. ')

  const prompt = `You are simulating a live trader chat room feed for ${symbol}.
Current price: $${price}, Change today: ${change > 0 ? '+' : ''}${parseFloat(change).toFixed(2)}%, Overall sentiment: ${sentimentLabel}.
Recent price history (last 7 days): ${priceHistory}.
Recent news: ${headlinesSummary}.

Generate 20 realistic trader chat messages that look like a live feed from the last 2 hours.
Use these trader archetypes and mix them throughout:
- Day traders (short term, technical levels, entries/exits)
- Swing traders (multi-day positions, trends)
- Options traders (calls, puts, IV, Greeks)
- Retail investors (longer term, fundamentals)
- Skeptics/bears (always questioning the move)
- Momentum chasers (FOMO buyers)
- Experienced veterans (calm, measured)

Rules:
- Reference actual price levels, % moves, and support/resistance
- Some messages should reply to or reference previous messages (use "@username")
- Use realistic trading slang: "ripping", "dumping", "bagholding", "FOMO", "dip buy", "stop out", "squeeze", "moon", "rug", "consolidating", "breakout", "support", "resistance"
- Vary message length: some very short (1 sentence), some longer (3-4 sentences)
- Include some with emojis, some without
- Timestamps should go from ~2 hours ago to just now
- Make it feel like a real heated discussion reflecting the current market conditions

Format as JSON array:
[{
  "username": "trader_name",
  "message": "...",
  "sentiment": "bullish|bearish|neutral",
  "timestamp": "X mins ago"
}]
Only return the JSON array, nothing else.`

  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || ''
  const clean = text.replace(/```json\n?|```\n?/g, '').trim()
  return JSON.parse(clean)
}

function ChartModal({ symbol, price, change, onClose }) {
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState(false)
  const [news, setNews] = useState([])
  const [sentimentScore, setSentimentScore] = useState(0)
  const [activeTab, setActiveTab] = useState('news')
  const [traderTalk, setTraderTalk] = useState([])
  const [traderLoading, setTraderLoading] = useState(false)
  const [traderGenerated, setTraderGenerated] = useState(false)

  const isPositive = change >= 0
  const { label: sentimentLabel, color: sentimentColor } = getLabel(sentimentScore)
  const distribution = getDistribution(sentimentScore, change)

  useEffect(() => {
    async function load() {
      const [candles, newsData] = await Promise.all([
        fetchCandles(symbol),
        fetchNewsAndQuote(symbol)
      ])
      if (!candles || candles.error || candles.length === 0) {
        setChartError(true)
      } else {
        setChartData(candles)
      }
      setChartLoading(false)
      const articles = newsData.news || []
      setNews(articles)
      const headlines = articles.map(a => a.headline)
      const score = computeSentiment(headlines, change)
      setSentimentScore(score)
    }
    load()
  }, [symbol])

  async function handleGenerateTraderTalk() {
    setTraderLoading(true)
    try {
      const talks = await generateTraderTalk(
        symbol, price, change, sentimentLabel, news, chartData
      )
      setTraderTalk(talks)
      setTraderGenerated(true)
    } catch (e) {
      console.error('Failed to generate trader talk:', e)
    }
    setTraderLoading(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 rounded-2xl p-4 md:p-6 w-full md:w-[800px] max-w-full max-h-[90vh] overflow-y-auto mx-2 md:mx-0">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
            <p className="text-2xl font-bold text-white mt-1">${parseFloat(price).toFixed(2)}</p>
            <p className={`text-sm mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{parseFloat(change).toFixed(2)}% today
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Chart + Sentiment side by side */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            {chartLoading && <p className="text-gray-400 text-center py-12">Loading chart...</p>}
            {chartError && <p className="text-gray-400 text-center py-12">No chart data available</p>}
            {!chartLoading && !chartError && (
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#ffffff' }}
                    formatter={(v) => [`$${v}`, 'Price']}
                  />
                  <Area type="monotone" dataKey="price" stroke={isPositive ? '#4ade80' : '#f87171'} strokeWidth={2} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <p className="text-gray-600 text-xs text-right mt-1">Past 30 days</p>
          </div>

          <div className="w-full md:w-48 flex flex-col items-center justify-center bg-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wide">Sentiment</p>
            <SentimentGauge score={sentimentScore} />
            <div className="w-full mt-3 flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-green-400">🟢 Buy</span>
                <span className="text-green-400 font-bold">{distribution.buy}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${distribution.buy}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-yellow-400">🟡 Neutral</span>
                <span className="text-yellow-400 font-bold">{distribution.neutral}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-yellow-400 h-1.5 rounded-full" style={{ width: `${distribution.neutral}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-red-400">🔴 Sell</span>
                <span className="text-red-400 font-bold">{distribution.sell}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${distribution.sell}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('news')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'news' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            📰 News
          </button>
          <button
            onClick={() => { setActiveTab('trader'); if (!traderGenerated) handleGenerateTraderTalk() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'trader' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            💬 Trader Talk
          </button>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'news' && (
            <div className="flex flex-col gap-3">
              {news.length === 0 && (
                <p className="text-gray-400 text-center py-8">No recent news found for {symbol}</p>
              )}
              {news.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-800 rounded-xl p-4 hover:bg-gray-700 transition-colors block"
                >
                  <div className="flex gap-3">
                    {article.image && (
                      <img src={article.image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-white text-sm font-medium leading-snug">{article.headline}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {article.source} · {new Date(article.datetime * 1000).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {activeTab === 'trader' && (
            <div className="flex flex-col gap-3">
              {traderLoading && (
                <p className="text-gray-400 text-center py-8">Generating trader talk...</p>
              )}
              {!traderLoading && traderTalk.map((twit, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold">
                      {twit.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-white text-sm font-medium">{twit.username}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      twit.sentiment === 'bullish' ? 'bg-green-900 text-green-400' :
                      twit.sentiment === 'bearish' ? 'bg-red-900 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {twit.sentiment === 'bullish' ? '📈 Bullish' : twit.sentiment === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
                    </span>
                    <span className="text-gray-500 text-xs ml-auto">{twit.timestamp}</span>
                  </div>
                  <p className="text-gray-300 text-sm">{twit.message}</p>
                </div>
              ))}
              {!traderLoading && traderGenerated && (
                <button
                  onClick={handleGenerateTraderTalk}
                  className="text-purple-400 text-sm text-center hover:text-purple-300 mt-2"
                >
                  🔄 Refresh trader talk
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default ChartModal