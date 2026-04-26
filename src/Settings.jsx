import { useState } from 'react'

function Settings({ assets, setAssets, token, onLogout }) {
  const [activeSection, setActiveSection] = useState(null)

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Preferences state
  const [refreshInterval, setRefreshInterval] = useState(
    parseInt(localStorage.getItem('refreshInterval')) || 30
  )

  async function handleChangePassword() {
    setPasswordMsg('')
    setPasswordError('')
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    const response = await fetch('http://localhost:3001/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    })
    const data = await response.json()
    if (!response.ok) {
      setPasswordError(data.error)
      return
    }
    setPasswordMsg('Password changed successfully!')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm('Are you sure? This will permanently delete your account, portfolio and all transaction history.')
    if (!confirmed) return
    await fetch('http://localhost:3001/api/auth/account', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    onLogout()
  }

  function handleClearDashboard() {
    const confirmed = window.confirm('Reset dashboard to default assets?')
    if (!confirmed) return
    localStorage.removeItem('assets')
    setAssets([])
    window.location.reload()
  }

  function handleClearWatchlist() {
    const confirmed = window.confirm('Clear your watchlist?')
    if (!confirmed) return
    localStorage.removeItem('watchlist')
  }

  function handleRefreshIntervalChange(seconds) {
    setRefreshInterval(seconds)
    localStorage.setItem('refreshInterval', seconds.toString())
  }

  async function handleExportCSV() {
    const response = await fetch('http://localhost:3001/api/transactions/export', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold mb-8">Settings</h2>

      {/* Account Section */}
      <div className="bg-gray-900 rounded-xl p-6 mb-4">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">👤 Account</h3>
        <p className="text-gray-400 text-sm mb-4">
          Signed in as <span className="text-white">{localStorage.getItem('email')}</span>
        </p>

        {/* Change Password */}
        <button
          onClick={() => setActiveSection(activeSection === 'password' ? null : 'password')}
          className="text-sm text-purple-400 hover:text-purple-300 mb-3 block"
        >
          {activeSection === 'password' ? '▲ Hide' : '▼ Change Password'}
        </button>

        {activeSection === 'password' && (
          <div className="flex flex-col gap-3 mb-4">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg outline-none"
            />
            {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
            {passwordMsg && <p className="text-green-400 text-sm">{passwordMsg}</p>}
            <button
              onClick={handleChangePassword}
              className="bg-purple-600 px-4 py-2 rounded-lg hover:bg-purple-700 text-white w-fit"
            >
              Update Password
            </button>
          </div>
        )}

        {/* Delete Account */}
        <button
          onClick={handleDeleteAccount}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Delete Account
        </button>
      </div>

      {/* Preferences Section */}
      <div className="bg-gray-900 rounded-xl p-6 mb-4">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">⚙️ Preferences</h3>

        <div className="mb-4">
          <p className="text-white text-sm mb-2">Price Refresh Interval</p>
          <p className="text-gray-400 text-xs mb-3">How often prices update automatically</p>
          <div className="flex gap-2">
            {[30, 60, 300].map(s => (
              <button
                key={s}
                onClick={() => handleRefreshIntervalChange(s)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  refreshInterval === s
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {s === 30 ? '30s' : s === 60 ? '1 min' : '5 min'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-white text-sm mb-2">Theme</p>
          <div className="flex gap-2">
            <button className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm">
              🌙 Dark
            </button>
            <button className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm" disabled>
              ☀️ Light (coming soon)
            </button>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-gray-900 rounded-xl p-6 mb-4">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">🗄️ Data Management</h3>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">Reset Dashboard</p>
              <p className="text-gray-400 text-xs">Restore default assets</p>
            </div>
            <button
              onClick={handleClearDashboard}
              className="bg-gray-800 px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 text-sm"
            >
              Reset
            </button>
          </div>

          <div className="border-t border-gray-800" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">Clear Watchlist</p>
              <p className="text-gray-400 text-xs">Remove all watchlist assets</p>
            </div>
            <button
              onClick={handleClearWatchlist}
              className="bg-gray-800 px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 text-sm"
            >
              Clear
            </button>
          </div>

          <div className="border-t border-gray-800" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">Export Transactions</p>
              <p className="text-gray-400 text-xs">Download your trade history as CSV</p>
            </div>
            <button
              onClick={handleExportCSV}
              className="bg-gray-800 px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 text-sm"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">ℹ️ About</h3>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Version</span>
            <span className="text-white">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Price Data</span>
            <span className="text-white">Finnhub</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Chart Data</span>
            <span className="text-white">Alpha Vantage</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">AI Features</span>
            <span className="text-white">Anthropic Claude</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Built with</span>
            <span className="text-white">React, Node.js, SQLite</span>
          </div>
        </div>
      </div>

    </div>
  )
}

export default Settings