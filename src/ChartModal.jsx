import {useEffect, useState} from 'react'
import {AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer} from 'recharts'

async function fetchCandles(symbol){
    const to = Math.floor(Date.now()/1000)
    const from = to - 60*60*24*30
    const response = await fetch(
        `http://localhost:3001/api/candles?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
    )
    return await response.json()
}

function ChartModal({symbol,price, change, onClose}) {
    const[chartData,setChartData] = useState([])
    const[loading, setLoading] = useState(true)
    const[error, setError] = useState(false)
    useEffect(() => {
        async function load(){
            const data = await fetchCandles(symbol)
            if(!data || data.s === 'no data' || !data.c){
                setError(true)
                setLoading(false)
                return
            }
            const formatted = data.t.map((timestamp, i) => ({
                date: new Date(timestamp*1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}),
                price: parseFloat(data.c[i].toFixed(2))                
            }))
            setChartData(formatted)
            setLoading(false)
        }
        load()
    }, [symbol])

    const isPositive = change >= 0

    return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 rounded-2xl p-6 w-[600px] max-w-full">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
            <p className="text-2xl font-bold text-white mt-1">${parseFloat(price).toFixed(2)}</p>
            <p className={`text-sm mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{parseFloat(change).toFixed(2)}% today
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Chart */}
        {loading && (
          <p className="text-gray-400 text-center py-12">Loading chart...</p>
        )}
        {error && (
          <p className="text-gray-400 text-center py-12">No chart data available for {symbol}</p>
        )}
        {!loading && !error && (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#ffffff' }}
                formatter={(v) => [`$${v}`, 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#4ade80' : '#f87171'}
                strokeWidth={2}
                fill="url(#colorPrice)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        <p className="text-gray-600 text-xs text-right mt-3">Past 30 days</p>
      </div>
    </div>
  )
}

export default ChartModal