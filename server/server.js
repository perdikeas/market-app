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

const CACHE_FILE = './candle-cache.json'
let candleCache = {}
if (fs.existsSync(CACHE_FILE)) {
  candleCache = JSON.parse(fs.readFileSync(CACHE_FILE))
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(candleCache))
}

const inFlight = {}

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})