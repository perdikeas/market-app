function App() {
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

        {/* Asset cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 p-4 rounded-xl">
            <p className="text-gray-400 text-sm">Gold</p>
            <p className="text-2xl font-bold">$2,345.00</p>
            <p className="text-green-400 text-sm">+1.2%</p>
          </div>
          <div className="bg-gray-900 p-4 rounded-xl">
            <p className="text-gray-400 text-sm">Tesla</p>
            <p className="text-2xl font-bold">$182.50</p>
            <p className="text-red-400 text-sm">-0.8%</p>
          </div>
          <div className="bg-gray-900 p-4 rounded-xl">
            <p className="text-gray-400 text-sm">Bitcoin</p>
            <p className="text-2xl font-bold">$67,200.00</p>
            <p className="text-green-400 text-sm">+3.4%</p>
          </div>
        </div>
      </div>

    </div>
  )
}

export default App