import { useState } from 'react'

function AlertModal({ symbol, currentPrice, onSave, onClose }) {
  const [targetPrice, setTargetPrice] = useState('')
  const [direction, setDirection] = useState('above')

  function handleSave() {
    if (!targetPrice || isNaN(parseFloat(targetPrice))) return
    onSave({
      symbol,
      targetPrice: parseFloat(targetPrice),
      direction
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 rounded-2xl p-6 w-80">
        <h3 className="text-white font-bold text-lg mb-1">Set Price Alert</h3>
        <p className="text-gray-400 text-sm mb-4">
          {symbol} — Current: ${parseFloat(currentPrice).toFixed(2)}
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDirection('above')}
            className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
              direction === 'above' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            📈 Goes Above
          </button>
          <button
            onClick={() => setDirection('below')}
            className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
              direction === 'below' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            📉 Goes Below
          </button>
        </div>

        <input
          type="number"
          placeholder="Target price ($)"
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
          className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg outline-none mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-purple-600 py-2 rounded-lg hover:bg-purple-700 text-white text-sm"
          >
            Set Alert
          </button>
          <button
            onClick={onClose}
            className="bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertModal