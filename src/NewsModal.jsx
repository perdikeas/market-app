import { useEffect, useState } from 'react'

async function fetchNews(symbol) {
    const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol
    const response = await fetch(`http://localhost:3001/api/news/${encodeURIComponent(cleanSymbol)}`)
    return await response.json()
}

async function fetchStockTwits(symbol) {
    console.log('fetchStockTwits called for:', symbol)
    const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1].replace('USDT', '') : symbol
    const response = await fetch(`http://localhost:3001/api/stocktwits/${encodeURIComponent(cleanSymbol)}`)
    return await response.json()
}

function NewsModal({ symbol, price, change, onClose, initialTab = 'news' }) {
    const [news, setNews] = useState([])
    const [twits, setTwits] = useState([])
    const [activeTab, setActiveTab] = useState(initialTab)
    const [newsLoading, setNewsLoading] = useState(true)
    const [twitsLoading, setTwitsLoading] = useState(true)

    const isPositive = change >= 0

    useEffect(() => {
        fetchNews(symbol).then(data => {
            setNews(Array.isArray(data) ? data : [])
            setNewsLoading(false)
        }).catch(() => setNewsLoading(false))

        fetchStockTwits(symbol).then(data => {
            setTwits(Array.isArray(data) ? data : [])
            setTwitsLoading(false)
        }).catch(() => setTwitsLoading(false))
    }, [symbol])

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-gray-900 rounded-2xl p-6 w-[650px] max-w-full max-h-[80vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">{symbol}</h2>
                        <p className="text-2xl font-bold text-white mt-1">${parseFloat(price).toFixed(2)}</p>
                        <p className={`text-sm mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{parseFloat(change).toFixed(2)}% today
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setActiveTab('news')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'news' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                        📰 News
                    </button>
                    <button
                        onClick={() => setActiveTab('twits')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'twits' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                        💬 Trader Talk
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1">

                    {activeTab === 'news' && (
                        <div className="flex flex-col gap-3">
                            {newsLoading && (
                                <p className="text-gray-400 text-center py-8">Loading news...</p>
                            )}
                            {!newsLoading && news.length === 0 && (
                                <p className="text-gray-400 text-center py-8">No recent news found for {symbol}</p>
                            )}
                            {!newsLoading && news.map((article, i) => (
                                <a
                                    key={i}
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-gray-800 rounded-xl p-4 hover:bg-gray-700 transition-colors block"
                                >
                                    <div className="flex gap-3">
                                        {article.image && (
                                            <img
                                                src={article.image}
                                                alt=""
                                                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                            />
                                        )}
                                        <div>
                                            <p className="text-white text-sm font-medium leading-snug">{article.headline}</p>
                                            <p className="text-gray-400 text-xs mt-1">
                                                {article.source} · {new Date(article.datetime * 1000).toLocaleDateString('en-US', {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}

                    {activeTab === 'twits' && (
                        <div className="flex flex-col gap-3">
                            {twitsLoading && (
                                <p className="text-gray-400 text-center py-8">Loading trader talk...</p>
                            )}
                            {!twitsLoading && twits.length === 0 && (
                                <p className="text-gray-400 text-center py-8">No trader posts found for {symbol}</p>
                            )}
                            {!twitsLoading && twits.map((twit) => (
                                <div key={twit.id} className="bg-gray-800 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <img
                                            src={twit.user.avatar_url_ssl}
                                            alt=""
                                            className="w-8 h-8 rounded-full"
                                        />
                                        <span className="text-white text-sm font-medium">{twit.user.username}</span>
                                        {twit.entities?.sentiment && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${twit.entities.sentiment.basic === 'Bullish'
                                                    ? 'bg-green-900 text-green-400'
                                                    : 'bg-red-900 text-red-400'
                                                }`}>
                                                {twit.entities.sentiment.basic === 'Bullish' ? '📈 Bullish' : '📉 Bearish'}
                                            </span>
                                        )}
                                        <span className="text-gray-500 text-xs ml-auto">
                                            {new Date(twit.created_at).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 text-sm">{twit.body}</p>
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}

export default NewsModal
