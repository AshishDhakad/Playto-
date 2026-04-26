import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

const STATUS_STYLES = {
  submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  under_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  approved: 'bg-green-500/10 text-[#00ff88] border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  more_info_requested: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  draft: 'bg-[#1a1a2e] text-[#888] border-[#2a2a3e]',
}

function Metric({ label, value, sub, highlight }) {
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
      <div className="text-xs text-[#555] uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-[#00ff88]' : 'text-white'}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-[#444] mt-1">{sub}</div>}
    </div>
  )
}

export default function ReviewerDashboard() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => { fetchQueue() }, [filter])

  const fetchQueue = async () => {
    setLoading(true)
    try {
      const params = filter ? `?status=${filter}` : ''
      const res = await api.get(`/reviewer/queue/${params}`)
      setData(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const logout = () => { localStorage.clear(); nav('/login') }

  const m = data?.metrics || {}

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <nav className="border-b border-[#1e1e2e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#00ff88] rounded-md flex items-center justify-center">
            <span className="text-black font-bold text-xs">P</span>
          </div>
          <span className="text-white font-semibold">Playto KYC</span>
          <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full ml-2">Reviewer</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#666]">{user.username}</span>
          <button onClick={logout} className="text-sm text-[#555] hover:text-white transition-colors">Sign out</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Review Queue</h1>
          <p className="text-sm text-[#555]">Submissions requiring your attention</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Metric label="In Queue" value={m.total_in_queue} />
          <Metric label="At Risk (SLA)" value={m.at_risk_count} highlight={m.at_risk_count > 0} sub="> 24h waiting" />
          <Metric label="Avg Wait" value={m.avg_wait_hours != null ? `${m.avg_wait_hours}h` : '—'} />
          <Metric label="Approval Rate 7d" value={m.approval_rate_7d != null ? `${m.approval_rate_7d}%` : '—'} sub={m.decided_last_7d ? `${m.approved_last_7d}/${m.decided_last_7d} decided` : 'No data'} />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[['', 'Active Queue'], ['submitted', 'Submitted'], ['under_review', 'Under Review'], ['more_info_requested', 'Info Needed'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === val ? 'bg-[#00ff88] text-black border-[#00ff88]' : 'bg-transparent text-[#666] border-[#2a2a3e] hover:border-[#444]'
              }`}>{label}</button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data?.submissions?.length === 0 ? (
          <div className="text-center py-20 text-[#444]">No submissions in this view.</div>
        ) : (
          <div className="space-y-2">
            {data?.submissions?.map(sub => (
              <Link key={sub.id} to={`/reviewer/submission/${sub.id}`}
                className="block bg-[#111118] border border-[#1e1e2e] hover:border-[#2a2a3e] rounded-xl p-5 transition-colors group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#1a1a2e] flex items-center justify-center text-sm font-bold text-[#00ff88] flex-shrink-0">
                      {sub.merchant_username?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{sub.merchant_username}</div>
                      <div className="text-xs text-[#555] truncate">{sub.business_name || 'No business name'} · {sub.business_type || 'Unknown type'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {sub.is_sla_at_risk && (
                      <span className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">⚠ SLA</span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[sub.status] || ''}`}>
                      {sub.status?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-[#444]">{sub.time_in_queue_hours != null ? `${sub.time_in_queue_hours}h` : '—'}</span>
                    <span className="text-[#444] group-hover:text-white transition-colors">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
