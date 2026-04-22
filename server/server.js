const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const app = express()
const PORT = 3001

app.use(cors({
  origin: 'http://localhost:5173'
}))

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30
})

app.use(limiter)

app.get('/api/candles', async (req, res) => {
  const { symbol, from, to } = req.query

  if (!symbol) return res.status(400).json({ error: 'Symbol required' })

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${process.env.VITE_FINNHUB_API_KEY}`
    )
    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch candles' })
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

app.get('/api/search', async(req,res) => {
  const query = req.query.q
  if(!query || query.length < 1) return res.json([])
    try{
      const response = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${process.env.VITE_FINNHUB_API_KEY}`)
      const data = await response.json()
      res.json(data.result || [])
    } catch{
      res.status(500).json({error: 'Search failed'})
    }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})