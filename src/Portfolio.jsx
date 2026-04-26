import { useState, useEffect, useRef } from 'react'
import ChartModal from './ChartModal'

async function fetchPortfolio(token) {
  const response = await fetch('http://localhost:3001/api/portfolio', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return await response.json()
}

async function fetchTransactionSummary(token) {
  const response = await fetch('http://localhost:3001/api/transactions/summary', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return await response.json()
}

async function fetchTransactions(token) {
  const response = await fetch('http://localhost:3001/api/transactions', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return await response.json()
}

async function fetchPrice(symbol) {
  const response = await fetch(`http://localhost:3001/api/quote?symbol=${encodeURIComponent(symbol)}`)
  const data = await response.json()
  return data
}

async function searchAssets(query) {
  const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(query)}`)
  return await response.json()
}

function Portfolio({ token }) {
  const [positions, setPositions] = useState([])
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [realizedPnL, setRealizedPnL] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [sellConfirm, setSellConfirm] = useState(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropDown, setShowDropDown] = useState(false)
  const [addingSymbol, setAddingSymbol] = useState(null)
  const [shares, setShares] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [addError, setAddError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editShares, setEditShares] = useState('')

  const debounceTimer = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropDown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query) { setSearchResults([]); return }
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      const results = await searchAssets(query)
      setSearchResults(results.slice(0, 6))
      setShowDropDown(true)
    }, 300)
  }, [query])

  async function loadAll() {
    setLoading(true)
    const [data, summary, txs] = await Promise.all([
      fetchPortfolio(token),
      fetchTransactionSummary(token),
      fetchTransactions(token)
    ])
    setPositions(data)
    setRealizedPnL(summary.total_realized_pnl || 0)
    setTransactions(txs)

    const priceMap = {}
    await Promise.all(data.map(async (pos) => {
      const quote = await fetchPrice(pos.symbol)
      if (quote && quote.c) priceMap[pos.symbol] = { price: quote.c, change: quote.dp }
    }))
    setPrices(priceMap)
    setLoading(false)
  }

  async function handleSelectSymbol(symbol) {
    setQuery('')
    setSearchResults([])
    setShowDropDown(false)
    const quote = await fetchPrice(symbol)
    setAddingSymbol(symbol)
    setAvgPrice(quote?.c?.toString() || '')
    setShares('')
    setAddError('')
  }

  async function handleAddPosition() {
    if (!shares) {
      setAddError('Please enter number of shares')
      return
    }
    const response = await fetch('http://localhost:3001/api/portfolio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        symbol: addingSymbol,
        shares: parseFloat(shares),
        avg_buy_price: parseFloat(avgPrice)
      })
    })
    const data = await response.json()
    if (!response.ok) {
      setAddError(data.error)
      return
    }
    setAddingSymbol(null)
    loadAll()
  }

  async function handleSell(id) {
    const response = await fetch(`http://localhost:3001/api/portfolio/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await response.json()
    setSellConfirm({
      pnl: data.pnl,
      sellPrice: data.sellPrice,
      symbol: positions.find(p => p.id === id)?.symbol
    })
    loadAll()
  }

  async function handleEditSave(id) {
    const pos = positions.find(p => p.id === id)
    await fetch(`http://localhost:3001/api/portfolio/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        shares: parseFloat(editShares),
        avg_buy_price: pos.avg_buy_price
      })
    })
    setEditingId(null)
    loadAll()
  }

  // Compute totals
  const netWorth = positions.reduce((sum, pos) => {
    const current = prices[pos.symbol]?.price || 0
    return sum + (current * pos.shares)
  }, 0)

  const unrealizedPnL = positions.reduce((sum, pos) => {
    const current = prices[pos.symbol]?.price || 0
    return sum + ((current - pos.avg_buy_price) * pos.shares)
  }, 0)

  const totalPnL = unrealizedPnL + realizedPnL

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Portfolio</h2>

      {/* Sell confirmation popup */}
      {sellConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-6 w-80 text-center">
            <h3 className="text-xl font-bold text-white mb-2">Position Closed</h3>
            <p className="text-gray-400 mb-1">{sellConfirm.symbol} sold at ${parseFloat(sellConfirm.sellPrice).toFixed(2)}</p>
            <p className={`text-2xl font-bold mb-4 ${sellConfirm.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {sellConfirm.pnl >= 0 ? '+' : ''}${parseFloat(sellConfirm.pnl).toFixed(2)}
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {sellConfirm.pnl >= 0 ? '🎉 Nice profit!' : '📉 Better luck next time'}
            </p>
            <button
              onClick={() => setSellConfirm(null)}
              className="bg-purple-600 px-6 py-2 rounded-lg hover:bg-purple-700 text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Net Worth</p>
          <p className="text-2xl font-bold text-white">
            ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 text-xs mt-1">Open positions value</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Unrealized P&L</p>
          <p className={`text-2xl font-bold ${unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 text-xs mt-1">Open positions gain/loss</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Total P&L</p>
          <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 text-xs mt-1">Realized + Unrealized</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-6 w-80" ref={searchRef}>
        <input
          type="text"
          placeholder="Search to buy a position..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
        />
        {showDropDown && searchResults.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-gray-800 rounded-lg shadow-lg z-10 overflow-hidden">
            {searchResults.map((result) => (
              <div
                key={result.symbol}
                onMouseDown={() => handleSelectSymbol(result.symbol)}
                className="px-4 py-2 hover:bg-gray-700 cursor-pointer"
              >
                <span className="font-bold text-white">{result.displaySymbol}</span>
                <span className="text-gray-400 text-sm ml-2">{result.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buy position form */}
      {addingSymbol && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6 flex flex-col gap-3 w-96">
          <p className="text-white font-medium">
            Buy <span className="text-purple-400">{addingSymbol}</span>
            {avgPrice && (
              <span className="text-gray-400 text-sm ml-2">@ ${parseFloat(avgPrice).toFixed(2)}</span>
            )}
          </p>
          <input
            type="number"
            placeholder="Number of shares"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
          />
          {addError && <p className="text-red-400 text-sm">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAddPosition}
              className="bg-purple-600 px-4 py-2 rounded-lg hover:bg-purple-700 text-white flex-1"
            >
              Buy
            </button>
            <button
              onClick={() => setAddingSymbol(null)}
              className="bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Positions */}
      {loading ? (
        <p className="text-gray-400">Loading portfolio...</p>
      ) : positions.length === 0 && transactions.length === 0 ? (
        <p className="text-gray-400">No positions yet. Search for an asset above to buy.</p>
      ) : (
        <>
          {positions.length > 0 && (
            <div className="flex flex-col gap-3 mb-8">
              <h3 className="text-lg font-semibold text-purple-400">Open Positions</h3>
              {positions.map((pos) => {
                const current = prices[pos.symbol]?.price || 0
                const change = prices[pos.symbol]?.change || 0
                const currentValue = current * pos.shares
                const pnl = (current - pos.avg_buy_price) * pos.shares
                const pnlPct = pos.avg_buy_price > 0 ? ((current - pos.avg_buy_price) / pos.avg_buy_price) * 100 : 0

                return (
                  <div key={pos.id} className="bg-gray-900 rounded-xl p-4">
                    {editingId === pos.id ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-white font-bold">{pos.symbol}</p>
                        <input
                          type="number"
                          value={editShares}
                          onChange={(e) => setEditShares(e.target.value)}
                          placeholder="Number of shares"
                          className="bg-gray-800 text-white px-3 py-1 rounded-lg outline-none w-48"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleEditSave(pos.id)} className="bg-purple-600 px-3 py-1 rounded-lg hover:bg-purple-700 text-white text-sm">Save</button>
                          <button onClick={() => setEditingId(null)} className="bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 text-white text-sm">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-32 cursor-pointer" onClick={() => setSelectedAsset({ name: pos.symbol, price: current, change })}>
                          <p className="text-white font-bold hover:text-purple-400">{pos.symbol}</p>
                          <p className="text-gray-400 text-sm">{pos.shares} shares</p>
                        </div>
                        <div className="w-28">
                          <p className="text-gray-400 text-xs">Buy Price</p>
                          <p className="text-white text-sm">${parseFloat(pos.avg_buy_price).toFixed(2)}</p>
                        </div>
                        <div className="w-28">
                          <p className="text-gray-400 text-xs">Current</p>
                          <p className="text-white text-sm">${current.toFixed(2)}</p>
                          <p className={`text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {change >= 0 ? '+' : ''}{change?.toFixed(2)}% today
                          </p>
                        </div>
                        <div className="w-28">
                          <p className="text-gray-400 text-xs">Value</p>
                          <p className="text-white text-sm">${currentValue.toFixed(2)}</p>
                        </div>
                        <div className="w-36">
                          <p className="text-gray-400 text-xs">P&L</p>
                          <p className={`text-sm font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </p>
                          <p className={`text-xs ${pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                          </p>
                        </div>
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => { setEditingId(pos.id); setEditShares(pos.shares) }} className="bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 text-white text-sm">Edit</button>
                          <button onClick={() => handleSell(pos.id)} className="bg-red-900 px-3 py-1 rounded-lg hover:bg-red-800 text-red-300 text-sm">Sell</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Transaction History */}
          {transactions.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-lg font-semibold text-purple-400">Transaction History</h3>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-gray-400 text-sm hover:text-white"
                >
                  {showHistory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showHistory && (
                <div className="flex flex-col gap-2">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="bg-gray-900 rounded-xl px-4 py-3 flex items-center gap-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tx.type === 'buy' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                        {tx.type === 'buy' ? 'BUY' : 'SELL'}
                      </span>
                      <span className="text-white font-medium w-20">{tx.symbol}</span>
                      <span className="text-gray-400 text-sm">{tx.shares} shares @ ${parseFloat(tx.price).toFixed(2)}</span>
                      {tx.pnl !== null && (
                        <span className={`text-sm font-medium ml-auto ${tx.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.pnl >= 0 ? '+' : ''}${parseFloat(tx.pnl).toFixed(2)}
                        </span>
                      )}
                      <span className="text-gray-500 text-xs ml-auto">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedAsset && (
        <ChartModal
          symbol={selectedAsset.name}
          price={selectedAsset.price}
          change={selectedAsset.change}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  )
}

export default Portfolio