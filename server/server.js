const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const fs = require('fs')
require('dotenv').config()

const app = express()
const PORT = 3001

app.use(cors({
  origin: 'http://localhost:5173'
}))

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200
})

app.use(limiter)

app.use(express.json())

const CACHE_FILE = './candle-cache.json'
let candleCache = {}
if (fs.existsSync(CACHE_FILE)) {
  candleCache = JSON.parse(fs.readFileSync(CACHE_FILE))
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(candleCache))
}

const inFlight = {}

const UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'ORCL', 'PLTR', 'AMD', 'INTC', 'CRM',
  'JPM', 'BAC', 'GS', 'MS', 'V', 'MA',
  'GLD', 'SLV', 'USO', 'XOM', 'CVX',
  'JNJ', 'PFE', 'UNH',
  'WMT', 'NKE', 'MCD',
  'BRK.B', 'SPY', 'QQQ', 'DIA',
  'BINANCE:BTCUSDT'
]

const SIGNIFICANCE = {
  'AAPL': 1.4, 'MSFT': 1.4, 'NVDA': 1.3, 'GOOGL': 1.3, 'META': 1.2,
  'AMZN': 1.2, 'TSLA': 1.3, 'ORCL': 1.1, 'PLTR': 1.1, 'AMD': 1.2,
  'INTC': 1.1, 'CRM': 1.1, 'JPM': 1.3, 'BAC': 1.1, 'GS': 1.2,
  'MS': 1.1, 'V': 1.2, 'MA': 1.1, 'GLD': 1.3, 'SLV': 1.2,
  'USO': 1.2, 'XOM': 1.2, 'CVX': 1.1, 'JNJ': 1.1, 'PFE': 1.0,
  'UNH': 1.2, 'WMT': 1.2, 'NKE': 1.0, 'MCD': 1.1,
  'BRK.B': 1.3, 'SPY': 1.4, 'QQQ': 1.3, 'DIA': 1.2,
  'BINANCE:BTCUSDT': 1.3
}

let hotCache = { data: null, timestamp: null }
const HOT_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function normalize(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 50)
  return values.map(v => ((v - min) / (max - min)) * 100)
}

app.get('/api/candles', async (req, res) => {
  const { symbol } = req.query

  if (!symbol) return res.status(400).json({ error: 'Symbol required' })

  const today = new Date().toISOString().split('T')[0]

  if (candleCache[symbol] && candleCache[symbol].date === today) {
    return res.json(candleCache[symbol].data)
  }

  if (inFlight[symbol]) {
    try {
      const data = await inFlight[symbol]
      return res.json(data)
    } catch {
      return res.status(500).json({ error: 'Failed to fetch candles' })
    }
  }

  inFlight[symbol] = (async () => {
    let formatted

    if (symbol.includes(':')) {
      const cryptoSymbol = symbol.split(':')[1].replace('USDT', '')
      const response = await fetch(`https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${cryptoSymbol}&market=USD&apikey=${process.env.ALPHA_VANTAGE_KEY}`)
      const data = await response.json()
      const timeSeries = data['Time Series (Digital Currency Daily)']
      if (!timeSeries) throw new Error('No data')
      formatted = Object.entries(timeSeries)
        .slice(0, 30)
        .reverse()
        .map(([date, values]) => ({
          date,
          price: parseFloat(parseFloat(values['4. close (USD)']).toFixed(2))
        }))
    } else {
      const response = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${process.env.ALPHA_VANTAGE_KEY}`)
      const data = await response.json()
      const timeSeries = data['Time Series (Daily)']
      if (!timeSeries) throw new Error('No data')
      formatted = Object.entries(timeSeries)
        .slice(0, 30)
        .reverse()
        .map(([date, values]) => ({
          date,
          price: parseFloat(values['4. close'])
        }))
    }

    candleCache[symbol] = { date: today, data: formatted }
    saveCache()
    return formatted
  })()

  try {
    const data = await inFlight[symbol]
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Failed to fetch candles' })
  } finally {
    delete inFlight[symbol]
  }
})

app.get('/api/quote', async (req, res) => {
  const symbol = req.query.symbol

  if (!symbol || !/^[A-Z0-9]{1,10}(:[A-Z0-9]{1,10}(_[A-Z]{1,3})?)?[!]?$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid ticker symbol' })
  }

  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.VITE_FINNHUB_API_KEY}`)
    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price' })
  }
})

app.get('/api/search', async (req, res) => {
  const query = req.query.q
  if (!query || query.length < 1) return res.json([])
  try {
    const response = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${process.env.VITE_FINNHUB_API_KEY}`)
    const data = await response.json()
    res.json(data.result || [])
  } catch {
    res.status(500).json({ error: 'Search failed' })
  }
})

app.get('/api/hot', async (req, res) => {
  // Serve from cache if fresh
  if (hotCache.data && Date.now() - hotCache.timestamp < HOT_CACHE_TTL) {
    return res.json(hotCache.data)
  }

  try {
    // Fetch all quotes in parallel
    const quotePromises = UNIVERSE.map(async (symbol) => {
      try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.VITE_FINNHUB_API_KEY}`)
        const data = await response.json()
        return { symbol, ...data }
      } catch {
        return null
      }
    })

    // Fetch news
    const newsResponse = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${process.env.VITE_FINNHUB_API_KEY}`)
    const newsData = await newsResponse.json()

    // Count news mentions per symbol
    const newsMentions = {}
    UNIVERSE.forEach(s => newsMentions[s] = 0)
    if (Array.isArray(newsData)) {
      newsData.forEach(article => {
        const text = (article.headline + ' ' + (article.summary || '')).toUpperCase()
        UNIVERSE.forEach(symbol => {
          const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol
          if (text.includes(ticker)) newsMentions[symbol]++
        })
      })
    }

    const quotes = (await Promise.all(quotePromises)).filter(q => q && q.c && q.c > 0)

    // Compute raw signals
    const momentums = quotes.map(q => Math.abs(q.dp || 0))
    const volatilities = quotes.map(q => q.o > 0 ? ((q.h - q.l) / q.o) * 100 : 0)
    const newsScores = quotes.map(q => newsMentions[q.symbol] || 0)

    // Normalize each signal to 0-100
    const normMomentums = normalize(momentums)
    const normVolatilities = normalize(volatilities)
    const normNews = normalize(newsScores)

    // Compute heat scores
    const scored = quotes.map((q, i) => {
      const significance = SIGNIFICANCE[q.symbol] || 1.0
      const rawScore = (normMomentums[i] * 0.30) + (50 * 0.25) + (normNews[i] * 0.25) + (normVolatilities[i] * 0.20)
      const heatScore = rawScore * significance
      return {
        symbol: q.symbol,
        price: q.c,
        change: q.dp,
        changeAbs: q.d,
        high: q.h,
        low: q.l,
        open: q.o,
        prevClose: q.pc,
        newsMentions: newsMentions[q.symbol] || 0,
        heatScore: parseFloat(heatScore.toFixed(2))
      }
    })

    // Sort for each category
    const hot = [...scored].sort((a, b) => b.heatScore - a.heatScore).slice(0, 6)
    const gainers = [...scored].sort((a, b) => b.change - a.change).slice(0, 6)
    const losers = [...scored].sort((a, b) => a.change - b.change).slice(0, 6)
    const inTheNews = [...scored].sort((a, b) => b.newsMentions - a.newsMentions).slice(0, 6)

    const result = { hot, gainers, losers, inTheNews, updatedAt: new Date().toISOString() }
    hotCache = { data: result, timestamp: Date.now() }
    res.json(result)

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hot assets' })
  }
})

app.get('/api/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol
  const to = Math.floor(Date.now() / 1000)
  const from = to - 60 * 60 * 24 * 7

  try {
    const [newsResponse, quoteResponse] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${new Date(from * 1000).toISOString().split('T')[0]}&to=${new Date(to * 1000).toISOString().split('T')[0]}&token=${process.env.VITE_FINNHUB_API_KEY}`),
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.VITE_FINNHUB_API_KEY}`)
    ])
    const news = await newsResponse.json()
    const quote = await quoteResponse.json()
    res.json({
      news: Array.isArray(news) ? news.slice(0, 10) : [],
      quote
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch news' })
  }
})


app.get('/api/stocktwits/:symbol', async (req, res) => {
  const { symbol } = req.params
  try {
    const response = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`)
    const data = await response.json()
    console.log('StockTwits response:', JSON.stringify(data).slice(0, 200))
    res.json(data.messages || [])
  } catch (err) {
    console.log('StockTwits error:', err.message)
    res.status(500).json({ error: 'Failed to fetch stocktwits' })
  }
})

app.post('/api/generate', async (req, res) => {
  console.log('Generate route hit')
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    })
    console.log('Anthropic status:', response.status)
    const data = await response.json()
    console.log('Anthropic response:', JSON.stringify(data).slice(0, 300))
    res.json(data)
  } catch (err) {
    console.log('Anthropic error:', err.message)
    res.status(500).json({ error: 'Failed to generate' })
  }
})


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})