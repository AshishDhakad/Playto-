import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'merchant', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const handle = async e => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/register/', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      nav(res.data.user.role === 'reviewer' ? '/reviewer' : '/merchant')
    } catch (err) {
      const errs = err.response?.data?.errors || {}
      setError(Object.values(errs).flat().join(' ') || 'Registration failed.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[#00ff88] rounded-md flex items-center justify-center">
              <span className="text-black font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-xl">Playto KYC</span>
          </div>
          <p className="text-[#666] text-sm">Create your account</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">
          {error && <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
          <form onSubmit={handle} className="space-y-4">
            {[['Username','username','text'],['Email','email','email'],['Phone','phone','tel'],['Password','password','password']].map(([label, key, type]) => (
              <div key={key}>
                <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">{label}</label>
                <input type={type} className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] transition-colors"
                  value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})} />
              </div>
            ))}
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Role</label>
              <select className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88]"
                value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="merchant">Merchant</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#00ff88] hover:bg-[#00e07a] text-black font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className="text-center text-sm text-[#666] mt-6">Already have an account? <Link to="/login" className="text-[#00ff88] hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  )
}
