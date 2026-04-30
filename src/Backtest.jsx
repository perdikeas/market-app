import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'

const BACKTEST_URL = import.meta.env.VITE_BACKTEST_URL || 'http://localhost:8000'

const PERIODS = [
  { label: '1 Month',  value: '1mo' },
  { label: '3 Months', value: '3mo' },
  { label: '6 Months', value: '6mo' },
  { label: '1 Year',   value: '1y'  },
  { label: '2 Years',  value: '2y'  },
  { label: '5 Years',  value: '5y'  },
]

// ─── Sub-components ────────────────────────────────────────────────────────

function MetricCard({ label, value, positive }) {
  const color =
    positive === null  ? 'text-white'
    : positive         ? 'text-green-400'
    :                    'text-red-400'
  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  )
}

/**
 * A slider that works for both int and float params.
 * Shows the current value inline and the min/max at each end.
 */
function ParamSlider({ name, schema, value, onChange }) {
  const step = schema.type === 'float'
    ? parseFloat(((schema.max - schema.min) / 100).toPrecision(2))
    : 1

  const [draft, setDraft] = useState(String(value))

  // Keep draft in sync if parent resets params (e.g. strategy change)
  useEffect(() => { setDraft(String(value)) }, [value])

  function commit(raw) {
    const parsed = schema.type === 'int' ? parseInt(raw) : parseFloat(raw)
    if (isNaN(parsed)) { setDraft(String(value)); return }
    const clamped = Math.min(schema.max, Math.max(schema.min, parsed))
    onChange(name, clamped)
    setDraft(String(clamped))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <label className="text-gray-400 text-xs">{schema.label}</label>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit(draft)}
          className="text-white text-xs font-mono bg-gray-700 px-2 py-0.5 rounded
                     w-16 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>
      <input
        type="range"
        min={schema.min} max={schema.max} step={step} value={value}
        onChange={e => {
          const v = schema.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
          onChange(name, v)
          setDraft(String(v))
        }}
        className="w-full accent-purple-500 cursor-pointer"
      />
      <div className="flex justify-between text-gray-600 text-xs">
        <span>{schema.min}</span>
        <span>{schema.max}</span>
      </div>
    </div>
  )
}

function EngineSlider({ label, hint, min, max, step, value, onChange, displayFn }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  function commit(raw) {
    const parsed = parseFloat(raw)
    if (isNaN(parsed)) { setDraft(String(value)); return }
    const clamped = Math.min(max, Math.max(min, parsed))
    onChange(clamped)
    setDraft(String(clamped))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <label className="text-gray-400 text-xs">{label}</label>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit(draft)}
          className="text-white text-xs font-mono bg-gray-700 px-2 py-0.5 rounded
                     w-16 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => {
          const v = parseFloat(e.target.value)
          onChange(v)
          setDraft(String(v))
        }}
        className="w-full accent-purple-500 cursor-pointer"
      />
      <p className="text-gray-600 text-xs">{hint}</p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export default function Backtest() {
  // ── Fetch config
  const [strategies, setStrategies]     = useState([])
  const [symbol, setSymbol]             = useState('AAPL')
  const [strategy, setStrategy]         = useState('')
  const [period, setPeriod]             = useState('1y')
  const [capital, setCapital]           = useState(10000)
  const [strategyParams, setStrategyParams] = useState({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Engine risk controls
  const [atrMultiplier, setAtrMultiplier]     = useState(3.0)
  const [minHoldingDays, setMinHoldingDays]   = useState(1)
  const [maxDrawdownPct, setMaxDrawdownPct]   = useState(100)

  // ── Result state
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Load strategy list on mount
  useEffect(() => {
    fetch(`${BACKTEST_URL}/strategies`)
      .then(r => r.json())
      .then(data => {
        setStrategies(data)
        if (data.length > 0) {
          setStrategy(data[0].key)
          setStrategyParams(defaultsFor(data[0]))
        }
      })
      .catch(() => setError('Could not connect to backtest service. Is it running on port 8000?'))
  }, [])

  // Reset strategy params to defaults whenever strategy changes
  useEffect(() => {
    if (!strategy || !strategies.length) return
    const meta = strategies.find(s => s.key === strategy)
    if (meta) setStrategyParams(defaultsFor(meta))
  }, [strategy, strategies])

  function defaultsFor(meta) {
    const out = {}
    Object.entries(meta.params).forEach(([k, v]) => { out[k] = v.default })
    return out
  }

  function handleParamChange(name, value) {
    setStrategyParams(prev => ({ ...prev, [name]: value }))
  }

  const selectedStrategy = strategies.find(s => s.key === strategy)
  const hasParams = selectedStrategy && Object.keys(selectedStrategy.params).length > 0

  // ── Run backtest
  async function runBacktest() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${BACKTEST_URL}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy,
          period,
          initial_capital: capital,
          params: strategyParams,
          atr_multiplier:   atrMultiplier,
          min_holding_days: minHoldingDays,
          max_drawdown_pct: maxDrawdownPct,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Backtest failed')
      }
      setResult(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const m = result?.metrics

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-white">Strategy Backtester</h2>

      {/* ── Control panel ──────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-5">

        {/* Row 1: symbol / strategy / period / capital / run */}
        <div className="flex flex-wrap gap-4 items-end">

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Ticker</label>
            <input
              className="bg-gray-800 text-white px-3 py-2 rounded-lg w-28 uppercase tracking-widest"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Strategy</label>
            <select
              className="bg-gray-800 text-white px-3 py-2 rounded-lg"
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
            >
              {strategies.map(s => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Period</label>
            <select
              className="bg-gray-800 text-white px-3 py-2 rounded-lg"
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              {PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Capital ($)</label>
            <input
              type="number"
              className="bg-gray-800 text-white px-3 py-2 rounded-lg w-32"
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              min={100}
            />
          </div>

          <button
            onClick={runBacktest}
            disabled={loading || !strategy}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40
                       rounded-lg font-semibold transition-colors ml-auto self-end"
          >
            {loading ? 'Running…' : 'Run Backtest'}
          </button>
        </div>

        {/* Strategy description */}
        {selectedStrategy?.description && (
          <p className="text-gray-400 text-sm border-l-2 border-purple-700 pl-3 leading-relaxed">
            {selectedStrategy.description}
          </p>
        )}

        {/* Strategy-specific params */}
        {hasParams && (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">
              Strategy Parameters
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              {Object.entries(selectedStrategy.params).map(([key, schema]) => (
                <ParamSlider
                  key={key}
                  name={key}
                  schema={schema}
                  value={strategyParams[key] ?? schema.default}
                  onChange={handleParamChange}
                />
              ))}
            </div>
          </div>
        )}

        {/* Advanced engine controls (collapsible) */}
        <div className="border-t border-gray-800 pt-4">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="currentColor" viewBox="0 0 20 20"
            >
              <path d="M6 6l8 4-8 4V6z" />
            </svg>
            Advanced Risk Controls
          </button>

          {showAdvanced && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
              <EngineSlider
                label="ATR Stop Multiplier"
                hint="Trailing stop width in ATRs. Set to 0 to disable."
                min={0} max={5} step={0.5}
                value={atrMultiplier}
                onChange={setAtrMultiplier}
                displayFn={v => v === 0 ? 'Off' : v}
              />
              <EngineSlider
                label="Min Holding Days"
                hint="Ignore sell signals for N days after entry. Prevents signal whipsaw."
                min={1} max={20} step={1}
                value={minHoldingDays}
                onChange={v => setMinHoldingDays(Math.round(v))}
              />
              <EngineSlider
                label="Drawdown Circuit Breaker"
                hint="Halt all new entries if portfolio drawdown exceeds this. 100 = off."
                min={5} max={100} step={5}
                value={maxDrawdownPct}
                onChange={v => setMaxDrawdownPct(Math.round(v))}
                displayFn={v => v === 100 ? 'Off' : `${v}%`}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard
              label="Total Return"
              value={`${m.total_return_pct > 0 ? '+' : ''}${m.total_return_pct}%`}
              positive={m.total_return_pct > 0}
            />
            <MetricCard
              label="Buy & Hold"
              value={`${m.benchmark_return_pct > 0 ? '+' : ''}${m.benchmark_return_pct}%`}
              positive={m.benchmark_return_pct > 0}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={m.sharpe_ratio}
              positive={m.sharpe_ratio > 1 ? true : m.sharpe_ratio < 0 ? false : null}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${m.max_drawdown_pct}%`}
              positive={false}
            />
            <MetricCard
              label="Win Rate"
              value={`${m.win_rate_pct}%`}
              positive={m.win_rate_pct > 50}
            />
            <MetricCard
              label="Total Trades"
              value={m.total_trades}
              positive={null}
            />
            <MetricCard
              label="Avg Trade P&L"
              value={`$${m.avg_trade_pnl}`}
              positive={m.avg_trade_pnl > 0}
            />
            <MetricCard
              label="Ann. Return"
              value={`${m.annualized_return_pct}%`}
              positive={m.annualized_return_pct > 0}
            />
            <MetricCard
              label="Volatility"
              value={`${m.volatility_pct}%`}
              positive={null}
            />
          </div>

          {/* Equity curve */}
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Equity Curve</h3>
              <span className="text-gray-500 text-xs">
                {result.start_date} → {result.end_date}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={result.equity_curve}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={d => d.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
                  labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <ReferenceLine y={capital} stroke="#374151" strokeDasharray="4 4" />
                <Line
                  type="monotone" dataKey="value"
                  name="Strategy" stroke="#a855f7"
                  dot={false} strokeWidth={2}
                />
                <Line
                  type="monotone" dataKey="benchmark"
                  name="Buy & Hold" stroke="#3b82f6"
                  dot={false} strokeWidth={2} strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Trade log */}
          {result.trades.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">
                Trade Log
                <span className="text-gray-500 font-normal text-sm ml-2">
                  ({result.trades.length} trades)
                </span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="pb-2 pr-4 font-medium">Entry</th>
                      <th className="pb-2 pr-4 font-medium">Exit</th>
                      <th className="pb-2 pr-4 font-medium">Entry $</th>
                      <th className="pb-2 pr-4 font-medium">Exit $</th>
                      <th className="pb-2 pr-4 font-medium">Shares</th>
                      <th className="pb-2 pr-4 font-medium">P&L</th>
                      <th className="pb-2 pr-4 font-medium">Return</th>
                      <th className="pb-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                        <td className="py-2 pr-4 text-gray-300">{t.entry_date}</td>
                        <td className="py-2 pr-4 text-gray-300">{t.exit_date}</td>
                        <td className="py-2 pr-4 text-gray-300">${t.entry_price}</td>
                        <td className="py-2 pr-4 text-gray-300">${t.exit_price}</td>
                        <td className="py-2 pr-4 text-gray-400">{t.shares}</td>
                        <td className={`py-2 pr-4 font-semibold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl >= 0 ? '+' : ''}${t.pnl}
                        </td>
                        <td className={`py-2 pr-4 ${t.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct}%
                        </td>
                        <td className="py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            t.exit_reason === 'stop_loss'
                              ? 'bg-red-900 text-red-300'
                              : t.exit_reason === 'end_of_period'
                              ? 'bg-gray-700 text-gray-400'
                              : 'bg-gray-800 text-gray-500'
                          }`}>
                            {t.exit_reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}