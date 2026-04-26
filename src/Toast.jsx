import { useEffect } from 'react'

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg text-white transition-all ${
      type === 'above' ? 'bg-green-700' : 'bg-red-700'
    }`}>
      <span className="text-xl">{type === 'above' ? '📈' : '📉'}</span>
      <div>
        <p className="font-bold text-sm">Price Alert Triggered</p>
        <p className="text-xs text-white text-opacity-90">{message}</p>
      </div>
      <button onClick={onClose} className="ml-4 text-white opacity-70 hover:opacity-100 text-lg leading-none">✕</button>
    </div>
  )
}

export default Toast