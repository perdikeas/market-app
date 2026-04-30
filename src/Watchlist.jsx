import { useState, useEffect, useRef } from 'react'
import AssetCard from './AssetCard'
import ChartModal from './ChartModal'
import NewsModal from './NewsModal'
import { useRefreshPrices } from './useRefreshPrices'

async function fetchPrice(ticker) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/quote?symbol=${encodeURIComponent(ticker)}`)
  const data = await response.json()
  return data
}

async function searchAssets(query) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${encodeURIComponent(query)}`)
  return await response.json()
}

async function fetchHot() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/hot`)
  return await response.json()
}

function HotCard({ symbol, price, change, newsMentions, heatScore, onCardClick, onNewsClick, onTraderClick }) {
  const isPositive = change >= 0
  return (
    <div
      onClick={onCardClick}
      className="bg-gray-900 p-4 rounded-xl cursor-pointer hover:bg-gray-800 transition-colors"
    >
      <div className="flex justify-between items-start mb-2">
        <p className="text-gray-400 text-sm">{symbol}</p>
        {heatScore && (
          <span
            onClick={(e) => { e.stopPropagation(); onTraderClick() }}
            className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full cursor-pointer hover:bg-purple-800"
          >
            🔥 {heatScore.toFixed(0)}
          </span>
        )}
      </div>
      <p className="text-xl font-bold">${parseFloat(price).toFixed(2)}</p>
      <p className={`text-sm mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {isPositive ? '+' : ''}{parseFloat(change).toFixed(2)}%
      </p>
      {newsMentions > 0 && (
        <p
          onClick={(e) => { e.stopPropagation(); onNewsClick() }}
          className="text-xs text-gray-500 mt-1 cursor-pointer hover:text-gray-300"
        >
          📰 {newsMentions} mentions
        </p>
      )}
    </div>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-lg font-semibold text-white mb-3">{children}</h3>
}

function Watchlist() {
  const [assets, setAssets] = useState([])
  const [hotData, setHotData] = useState(null)
  const [hotLoading, setHotLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropDown, setShowDropDown] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [newsAsset, setNewsAsset] = useState(null)
  const debounceTimer = useRef(null)
  const searchRef = useRef(null)
  const closeTimer = useRef(null)

  useRefreshPrices(assets, setAssets)

  useEffect(() => {
    const saved = localStorage.getItem('watchlist')
    if (saved) setAssets(JSON.parse(saved))
  }, [])

  useEffect(() => {
    if (assets.length > 0) {
      localStorage.setItem('watchlist', JSON.stringify(assets))
    }
  }, [assets])

  useEffect(() => {
    fetchHot().then(data => {
      setHotData(data)
      setHotLoading(false)
    }).catch(() => setHotLoading(false))
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

  useEffect(() => {
    if (!query) return
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setShowDropDown(false), 5000)
  }, [query])

  async function handleSelectAsset(symbol) {
    setQuery('')
    setSearchResults([])
    setShowDropDown(false)
    if (assets.find(a => a.name === symbol)) return
    const data = await fetchPrice(symbol)
    if (data && data.c) {
      setAssets(prev => [...prev, { name: symbol, price: data.c, change: data.dp }])
    }
  }

  function handleRemoveAsset(name) {
    const updated = assets.filter(a => a.name !== name)
    setAssets(updated)
    if (updated.length === 0) localStorage.removeItem('watchlist')
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-8">Watchlist</h2>

      {/* Market Intelligence */}
      {hotLoading ? (
        <p className="text-gray-400 mb-8">Loading market data...</p>
      ) : hotData && (
        <div className="mb-10">
          <h3 className="text-xl font-bold text-purple-400 mb-6">📊 Market Intelligence</h3>

          {/* Hot Right Now */}
          <div className="mb-6">
            <SectionTitle>🔥 Hot Right Now</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hotData.hot.map(item => (
                <HotCard
                  key={item.symbol}
                  {...item}
                  onCardClick={() => setSelectedAsset({ name: item.symbol, price: item.price, change: item.change })}
                  onNewsClick={() => setNewsAsset({ name: item.symbol, price: item.price, change: item.change, tab: 'news' })}
                  onTraderClick={() => setNewsAsset({ name: item.symbol, price: item.price, change: item.change, tab: 'twits' })}
                />
              ))}
            </div>
          </div>

          {/* Gainers and Losers side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <SectionTitle>📈 Biggest Gainers</SectionTitle>
              <div className="flex flex-col gap-2">
                {hotData.gainers.map(item => (
                  <div
                    key={item.symbol}
                    onClick={() => setSelectedAsset({ name: item.symbol, price: item.price, change: item.change })}
                    className="bg-gray-900 px-4 py-3 rounded-xl flex justify-between items-center cursor-pointer hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-white font-medium">{item.symbol}</span>
                    <div className="text-right">
                      <p className="text-white text-sm">${parseFloat(item.price).toFixed(2)}</p>
                      <p className="text-green-400 text-sm">+{parseFloat(item.change).toFixed(2)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle>📉 Biggest Losers</SectionTitle>
              <div className="flex flex-col gap-2">
                {hotData.losers.map(item => (
                  <div
                    key={item.symbol}
                    onClick={() => setSelectedAsset({ name: item.symbol, price: item.price, change: item.change })}
                    className="bg-gray-900 px-4 py-3 rounded-xl flex justify-between items-center cursor-pointer hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-white font-medium">{item.symbol}</span>
                    <div className="text-right">
                      <p className="text-white text-sm">${parseFloat(item.price).toFixed(2)}</p>
                      <p className="text-red-400 text-sm">{parseFloat(item.change).toFixed(2)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* In The News */}
          {hotData.inTheNews.length > 0 && (
            <div>
              <SectionTitle>📰 In The News</SectionTitle>
              <div className="grid grid-cols-3 gap-3">
                {hotData.inTheNews.map(item => (
                  <HotCard
                    key={item.symbol}
                    {...item}
                    onCardClick={() => setSelectedAsset({ name: item.symbol, price: item.price, change: item.change })}
                    onNewsClick={() => setNewsAsset({ name: item.symbol, price: item.price, change: item.change, tab: 'news' })}
                    onTraderClick={() => setNewsAsset({ name: item.symbol, price: item.price, change: item.change, tab: 'twits' })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-800 mb-8" />

      {/* Personal Watchlist */}
      <h3 className="text-xl font-bold text-purple-400 mb-6">⭐ My Watchlist</h3>

      {/* Search bar */}
      <div className="relative mb-6 w-80" ref={searchRef}>
        <input
          type="text"
          placeholder="Search for an asset..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
        />
        {showDropDown && searchResults.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-gray-800 rounded-lg shadow-lg z-10 overflow-hidden">
            {searchResults.map((result) => (
              <div
                key={result.symbol}
                onMouseDown={() => handleSelectAsset(result.symbol)}
                className="px-4 py-2 hover:bg-gray-700 cursor-pointer"
              >
                <span className="font-bold text-white">{result.displaySymbol}</span>
                <span className="text-gray-400 text-sm ml-2">{result.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {assets.length === 0 ? (
        <p className="text-gray-400">No assets in your watchlist yet. Search for one above.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {assets.map((asset) => (
            <AssetCard
              key={asset.name} name={asset.name}
              price={asset.price} change={asset.change}
              onRemove={() => handleRemoveAsset(asset.name)}
              onClick={() => setSelectedAsset(asset)}
            />
          ))}
        </div>
      )}

      {selectedAsset && (
        <ChartModal
          symbol={selectedAsset.name}
          price={selectedAsset.price}
          change={selectedAsset.change}
          onClose={() => setSelectedAsset(null)}
        />
      )}

      {newsAsset && (
        <NewsModal
          symbol={newsAsset.name}
          price={newsAsset.price}
          change={newsAsset.change}
          initialTab={newsAsset.tab || 'news'}
          onClose={() => setNewsAsset(null)}
        />
      )}
    </div>
  )
}

export default Watchlist