import AssetCard from './AssetCard'
import { useState } from 'react'
function App() {

  const [assets, setAssets] = useState([
  { name: 'Gold', price: '$2,345.00', change: '+1.2%' },
  { name: 'Tesla', price: '$182.50', change: '-0.8%' },
  { name: 'Bitcoin', price: '$67,200.00', change: '+3.4%' },
  { name: 'Apple', price: '189.00', change: '+0.5%'}
  ])

  const [newAssetName, setNewAssetName] = useState('')

  function handleAddAsset() {
    if(assets.find((asset) => asset.name === newAssetName)){
      return
    }
    setAssets([...assets, { name: newAssetName, price: '...', change: '...' }])
    setNewAssetName('')
  }

  function handleRemoveAsset(name){
    setAssets(assets.filter((asset) => asset.name !== name))
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-purple-400">MarketDash</h1>
        <nav className="flex flex-col gap-2">
          <a href="#" className="bg-gray-800 px-4 py-2 rounded-lg text-white">Dashboard</a>
          <a href="#" className="px-4 py-2 rounded-lg text-gray-400 hover:text-white">Portfolio</a>
          <a href="#" className="px-4 py-2 rounded-lg text-gray-400 hover:text-white">Watchlist</a>
          <a href="#" className="px-4 py-2 rounded-lg text-gray-400 hover:text-white">Settings</a>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 p-8">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

        <div className = "flex gap-2 mb-6">
          <input 
            type = "text"
            placeholder = "Add asset"
            value = {newAssetName}
            onChange = {(e) => setNewAssetName(e.target.value)}
            onKeyDown = {(e) => {
              if(e.key === 'Enter') handleAddAsset()
            }}
            className = "bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
            />
          <button onClick = {handleAddAsset} className = "bg-purple-600 px-4 py-2 rounded-lg hover:bg-purple-700">
            Add
          </button>
        </div>

        {/* Asset cards */}
        <div className = "grid grid-cols-3 gap-4">
          {assets.map((asset) => (
            <AssetCard 
            key = {asset.name} name = {asset.name} 
            price = {asset.price} change = {asset.change} 
            onRemove = {() => handleRemoveAsset(asset.name)}
            />
          ))}
        </div>

      </div>

    </div>
  )
}

export default App