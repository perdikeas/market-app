import { useState, useEffect, useRef } from 'react'
import AssetCard from './AssetCard'
import ChartModal from './ChartModal'
import { AssetCardSkeleton } from './Skeleton'
import AlertModal from './AlertModal'
import Toast from './Toast'

async function fetchPrice(ticker) {
  const response = await fetch(`http://localhost:3001/api/quote?symbol=${encodeURIComponent(ticker)}`)
  const data = await response.json()
  return data
}

async function searchAssets(query) {
  const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(query)}`)
  return await response.json()
}

function Dashboard({ assets, setAssets }) {

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropDown, setShowDropDown] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alertAsset, setAlertAsset] = useState(null)
  const [toast, setToast] = useState(null)
  const debounceTimer = useRef(null)
  const searchRef = useRef(null)
  const closeTimer = useRef(null)

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

  useEffect(() => {
    if (assets.length > 0) {
      setLoading(false)
    }
  }, [assets])

  useEffect(() => {
    const alerts = JSON.parse(localStorage.getItem('alerts') || '[]')
    if (alerts.length === 0) return

    const remaining = []
    let triggered = null

    alerts.forEach(alert => {
      const asset = assets.find(a => a.name === alert.symbol)
      if (!asset) { remaining.push(alert); return }

      const triggered_above = alert.direction === 'above' && asset.price >= alert.targetPrice
      const triggered_below = alert.direction === 'below' && asset.price <= alert.targetPrice

      if (triggered_above || triggered_below) {
        triggered = {
          message: `${alert.symbol} is ${alert.direction} $${alert.targetPrice.toFixed(2)} — now at $${asset.price.toFixed(2)}`,
          type: alert.direction
        }
      } else {
        remaining.push(alert)
      }
    })

    localStorage.setItem('alerts', JSON.stringify(remaining))
    if (triggered) setToast(triggered)
  }, [assets])

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
    setAssets(assets.filter((asset) => asset.name !== name))
  }

  function handleSaveAlert(alert) {
    const alerts = JSON.parse(localStorage.getItem('alerts') || '[]')
    alerts.push(alert)
    localStorage.setItem('alerts', JSON.stringify(alerts))
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && assets.length === 0
          ? Array(8).fill(0).map((_, i) => <AssetCardSkeleton key={i} />)
          : assets.map((asset) => (
            <AssetCard
              key={asset.name} name={asset.name}
              price={asset.price} change={asset.change}
              onRemove={() => handleRemoveAsset(asset.name)}
              onClick={() => setSelectedAsset(asset)}
              onAlert={() => setAlertAsset(asset)}
            />
          ))
        }
      </div>

      {selectedAsset && (
        <ChartModal
          symbol={selectedAsset.name}
          price={selectedAsset.price}
          change={selectedAsset.change}
          onClose={() => setSelectedAsset(null)}
        />
      )}

      {alertAsset && (
        <AlertModal
          symbol={alertAsset.name}
          currentPrice={alertAsset.price}
          onSave={handleSaveAlert}
          onClose={() => setAlertAsset(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

    </div>
  )
}

export default Dashboard