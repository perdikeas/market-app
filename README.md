# MarketDash 📈

A full-stack market dashboard application built with React and Node.js, featuring real-time stock prices, AI-powered trader talk, portfolio tracking, and market intelligence.

## Features

- **Real-time prices** — Live stock, crypto and ETF prices with 30s auto-refresh
- **Interactive charts** — 30-day price history with sentiment gauge (TradingView-style)
- **AI Trader Talk** — Claude-powered realistic trader conversations per asset
- **News feed** — Latest company news per asset from Finnhub
- **Market Intelligence** — Heat score algorithm ranking assets by momentum, volatility and news mentions
- **Portfolio tracking** — Buy/sell positions with real-time P&L, transaction history and portfolio value chart
- **Price alerts** — Set target price alerts with toast notifications
- **User authentication** — JWT-based auth with bcrypt password hashing and SQLite database
- **Settings** — Password change, data export (CSV), refresh interval, account management

## Tech Stack

**Frontend**
- React 18
- Vite
- Tailwind CSS
- Recharts

**Backend**
- Node.js
- Express
- SQLite (better-sqlite3)
- JWT + bcrypt

**APIs**
- Finnhub — real-time stock prices and news
- Alpha Vantage — historical price data
- Anthropic Claude — AI trader talk generation

## Getting Started

### Prerequisites
- Node.js 18+
- API keys for Finnhub, Alpha Vantage and Anthropic

### Installation

1. Clone the repo:
```bash
git clone https://github.com/perdikeas/market-app.git
cd market-app
```

2. Install frontend dependencies (from project root)
```bash
npm install
```

3. Install backend dependencies:
```bash
cd server
npm install
cd ..  #go back to project root
```

4. Create `server/.env`:
```
VITE_FINNHUB_API_KEY=your_finnhub_key
ALPHA_VANTAGE_KEY=your_alphavantage_key
ANTHROPIC_API_KEY=your_anthropic_key
JWT_SECRET=your_jwt_secret
```

5. Create `.env` in the project root:
```
VITE_API_URL=http://localhost:3001
```

### Running locally

Start the backend:
```bash
cd server
node server.js
```

Start the frontend:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## License
MIT