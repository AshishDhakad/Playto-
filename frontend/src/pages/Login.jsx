import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const handle = async e => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/login/', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      nav(res.data.user.role === 'reviewer' ? '/reviewer' : '/merchant')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[#00ff88] rounded-md flex items-center justify-center">
              <span className="text-black font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">Playto KYC</span>
          </div>
          <p className="text-[#666] text-sm">Sign in to continue</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">
          {error && <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Username</label>
              <input className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] transition-colors"
                value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="your_username" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Password</label>
              <input type="password" className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] transition-colors"
                value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#00ff88] hover:bg-[#00e07a] text-black font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 mt-2">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <div className="mt-6 pt-6 border-t border-[#1e1e2e]">
            <p className="text-center text-sm text-[#666]">No account? <Link to="/register" className="text-[#00ff88] hover:underline">Create one</Link></p>
          </div>
          <div className="mt-5 p-3 bg-[#0a0a0f] rounded-lg border border-[#1e1e2e]">
            <p className="text-xs text-[#555] mb-2" style={{fontFamily:'monospace'}}>// test credentials (click to fill)</p>
            {[['Reviewer', 'reviewer1', 'reviewer123'],['Merchant (in review)', 'merchant_review', 'merchant123'],['Merchant (draft)', 'merchant_draft', 'merchant123']].map(([label, u, p]) => (
              <button key={u} onClick={() => setForm({ username: u, password: p })}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[#1a1a2e] transition-colors">
                <span className="text-xs text-[#555]">{label}: </span>
                <span className="text-xs text-[#00ff88]" style={{fontFamily:'monospace'}}>{u}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
