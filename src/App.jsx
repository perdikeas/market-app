import { useState, useEffect } from 'react'
import { useRefreshPrices } from './useRefreshPrices'
import Dashboard from './Dashboard'
import Portfolio from './Portfolio'
import Watchlist from './Watchlist'
import Settings from './Settings'
import Login from './Login'

async function fetchPrice(ticker) {
  const response = await fetch(`http://localhost:3001/api/quote?symbol=${encodeURIComponent(ticker)}`)
  const data = await response.json()
  return data
}

function App() {
  const [assets, setAssets] = useState([])
  const [currentTab, setCurrentTab] = useState('dashboard')
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [email, setEmail] = useState(localStorage.getItem('email'))

  useRefreshPrices(assets, setAssets)

  useEffect(() => {
    const saved = localStorage.getItem('assets')
    if (saved) {
      setAssets(JSON.parse(saved))
      return
    }
    const defaultAssets = ['AAPL', 'TSLA', 'NVDA', 'MSFT',
      'BINANCE:BTCUSDT', 'ORCL', 'PLTR', 'JPM']
    defaultAssets.forEach(async (ticker) => {
      const data = await fetchPrice(ticker)
      if (data && data.c) {
        setAssets(prev => {
          if (prev.find(a => a.name === ticker)) return prev
          return [...prev, { name: ticker, price: data.c, change: data.dp }]
        })
      }
    })
  }, [])

  useEffect(() => {
    if (assets.length > 0) {
      localStorage.setItem('assets', JSON.stringify(assets))
    }
  }, [assets])

  function handleLogin(token, email) {
    setToken(token)
    setEmail(email)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    setToken(null)
    setEmail(null)
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="flex h-screen bg-gray-950 text-white">

      {/* Sidebar */}
      <div className="w-64 bg-gray-900 p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-purple-400">MarketDash</h1>
        <nav className="flex flex-col gap-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`px-4 py-2 rounded-lg text-left transition-colors ${
                currentTab === item.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* User info + logout at bottom of sidebar */}
        <div className="mt-auto">
          <p className="text-gray-500 text-xs mb-2 truncate">{email}</p>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 text-left text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {currentTab === 'dashboard' && (
          <Dashboard assets={assets} setAssets={setAssets} />
        )}
        {currentTab === 'portfolio' && (
          <Portfolio assets={assets} token={token} />
        )}
        {currentTab === 'watchlist' && (
          <Watchlist />
        )}
        {currentTab === 'settings' && (
          <Settings assets={assets} setAssets={setAssets} />
        )}
      </div>

    </div>
  )
}

export default App