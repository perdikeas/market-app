import {useState} from 'react'

function Login({ onLogin}){
    const[mode, setMode] = useState('login')
    const[email, setEmail] = useState('')
    const[password, setPassword] = useState('')
    const[error, setError] = useState('')
    const[loading, setLoading] = useState(false)

    async function handleSubmit(){
        setError('')
        setLoading(true)
        
        try{
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json'}, 
                body: JSON.stringify({ email, password})
            })
            const data = await response.json()
            if(!response.ok){
                setError(data.error || 'Something went wrong')
                setLoading(false)
                return
            }

            localStorage.setItem('token', data.token)
            localStorage.setItem('email', data.email)
            onLogin(data.token, data.email)
        } catch(err){
            setError('Could not connect to server')
        }
        setLoading(false)
    }

    return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md">

        {/* Logo */}
        <h1 className="text-3xl font-bold text-purple-400 text-center mb-2">MarketDash</h1>
        <p className="text-gray-400 text-center mb-8">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </p>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="you@example.com"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="••••••••"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        {/* Toggle */}
        <p className="text-gray-400 text-center mt-6 text-sm">
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            className="text-purple-400 hover:text-purple-300"
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>

      </div>
    </div>
  )
}

export default Login