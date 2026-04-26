import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const STEPS = ['Personal Details', 'Business Details', 'Documents', 'Review & Submit']

const STATUS_STYLES = {
  draft: 'bg-[#1a1a2e] text-[#888] border-[#2a2a3e]',
  submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  under_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  approved: 'bg-green-500/10 text-[#00ff88] border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  more_info_requested: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

const DOC_LABELS = { pan: 'PAN Card', aadhaar: 'Aadhaar Card', bank_statement: 'Bank Statement' }

export default function MerchantDashboard() {
  const [sub, setSub] = useState(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState('')
  const nav = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    business_name: '', business_type: '', monthly_volume_usd: ''
  })

  useEffect(() => { fetchSub() }, [])

  const fetchSub = async () => {
    try {
      const res = await api.get('/merchant/submission/')
      setSub(res.data)
      setForm({
        full_name: res.data.full_name || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
        business_name: res.data.business_name || '',
        business_type: res.data.business_type || '',
        monthly_volume_usd: res.data.monthly_volume_usd || ''
      })
    } catch (e) { setError('Failed to load submission.') }
    finally { setLoading(false) }
  }

  const canEdit = sub && ['draft', 'more_info_requested'].includes(sub.status)

  const saveProgress = async () => {
    if (!canEdit) return
    setSaving(true); setError(''); setSuccess('')
    try {
      await api.patch('/merchant/submission/update/', form)
      setSuccess('Progress saved.')
      await fetchSub()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed.')
    } finally { setSaving(false) }
  }

  const handleUpload = async (docType, file) => {
    if (!file) return
    setUploadingDoc(docType); setError('')
    const fd = new FormData()
    fd.append('doc_type', docType)
    fd.append('file', file)
    try {
      await api.post('/merchant/submission/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSuccess(`${DOC_LABELS[docType]} uploaded.`)
      await fetchSub()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      const errs = e.response?.data?.errors || {}
      setError(Object.values(errs).flat().join(' ') || 'Upload failed.')
    } finally { setUploadingDoc('') }
  }

  const handleSubmit = async () => {
    setSubmitting(true); setError('')
    try {
      await saveProgress()
      const res = await api.post('/merchant/submission/submit/')
      setSub(res.data)
      setSuccess('KYC submitted successfully!')
    } catch (e) {
      setError(e.response?.data?.error || 'Submission failed.')
    } finally { setSubmitting(false) }
  }

  const logout = () => {
    localStorage.clear()
    nav('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const uploadedDocs = (sub?.documents || []).reduce((acc, d) => ({ ...acc, [d.doc_type]: d }), {})

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Nav */}
      <nav className="border-b border-[#1e1e2e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#00ff88] rounded-md flex items-center justify-center">
            <span className="text-black font-bold text-xs">P</span>
          </div>
          <span className="text-white font-semibold">Playto KYC</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#666]">{user.username}</span>
          <button onClick={logout} className="text-sm text-[#555] hover:text-white transition-colors">Sign out</button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Status Banner */}
        {sub && (
          <div className={`mb-8 px-5 py-4 rounded-xl border flex items-center justify-between ${STATUS_STYLES[sub.status] || 'bg-[#111118] border-[#1e1e2e]'}`}>
            <div>
              <span className="text-xs uppercase tracking-wider opacity-60">Application Status</span>
              <div className="font-semibold mt-0.5 capitalize">{sub.status.replace(/_/g, ' ')}</div>
            </div>
            {sub.reviewer_note && (
              <div className="text-sm opacity-80 max-w-xs text-right">"{sub.reviewer_note}"</div>
            )}
          </div>
        )}

        {/* Alerts */}
        {error && <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
        {success && <div className="mb-5 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-lg text-[#00ff88] text-sm">{success}</div>}

        {/* Step Tabs */}
        <div className="flex gap-1 mb-8 bg-[#111118] p-1 rounded-xl border border-[#1e1e2e]">
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${step === i ? 'bg-[#00ff88] text-black' : 'text-[#666] hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Step 0: Personal */}
        {step === 0 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg mb-2">Personal Details</h2>
            {[['Full Name','full_name','text'],['Email','email','email'],['Phone','phone','tel']].map(([label, key, type]) => (
              <div key={key}>
                <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">{label}</label>
                <input type={type} disabled={!canEdit}
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] transition-colors disabled:opacity-40"
                  value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})} />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              {canEdit && <button onClick={saveProgress} disabled={saving}
                className="px-5 py-2.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>}
              <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-[#00ff88] hover:bg-[#00e07a] text-black text-sm font-semibold rounded-lg transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Business */}
        {step === 1 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg mb-2">Business Details</h2>
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Business Name</label>
              <input disabled={!canEdit} className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] disabled:opacity-40"
                value={form.business_name} onChange={e => setForm({...form, business_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Business Type</label>
              <select disabled={!canEdit} className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] disabled:opacity-40"
                value={form.business_type} onChange={e => setForm({...form, business_type: e.target.value})}>
                <option value="">Select type...</option>
                {[['agency','Agency'],['freelancer','Freelancer'],['ecommerce','E-Commerce'],['saas','SaaS'],['other','Other']].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1.5 uppercase tracking-wider">Expected Monthly Volume (USD)</label>
              <input type="number" disabled={!canEdit} className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00ff88] disabled:opacity-40"
                value={form.monthly_volume_usd} onChange={e => setForm({...form, monthly_volume_usd: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(0)} className="px-5 py-2.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-sm rounded-lg">← Back</button>
              {canEdit && <button onClick={saveProgress} disabled={saving}
                className="px-5 py-2.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-sm rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>}
              <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-[#00ff88] hover:bg-[#00e07a] text-black text-sm font-semibold rounded-lg">Next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Documents */}
        {step === 2 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg mb-2">Documents</h2>
            <p className="text-sm text-[#555] mb-4">PDF, JPG, or PNG only. Max 5 MB per file.</p>
            {['pan', 'aadhaar', 'bank_statement'].map(docType => {
              const existing = uploadedDocs[docType]
              return (
                <div key={docType} className="border border-[#2a2a3e] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-white">{DOC_LABELS[docType]}</div>
                      {existing && <div className="text-xs text-[#555] mt-0.5">{existing.original_filename} · {(existing.file_size/1024).toFixed(0)} KB</div>}
                    </div>
                    {existing
                      ? <span className="text-xs px-2 py-1 bg-green-500/10 text-[#00ff88] border border-green-500/20 rounded-full">✓ Uploaded</span>
                      : <span className="text-xs px-2 py-1 bg-[#1a1a2e] text-[#666] border border-[#2a2a3e] rounded-full">Missing</span>
                    }
                  </div>
                  {canEdit && (
                    <label className="block cursor-pointer">
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                        onChange={e => handleUpload(docType, e.target.files[0])}
                        disabled={uploadingDoc === docType} />
                      <span className={`inline-block px-4 py-2 text-xs rounded-lg border transition-colors ${
                        uploadingDoc === docType
                          ? 'border-[#2a2a3e] text-[#555] cursor-not-allowed'
                          : 'border-[#2a2a3e] text-[#888] hover:border-[#00ff88] hover:text-[#00ff88] cursor-pointer'
                      }`}>
                        {uploadingDoc === docType ? 'Uploading...' : existing ? 'Replace file' : 'Upload file'}
                      </span>
                    </label>
                  )}
                </div>
              )
            })}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-sm rounded-lg">← Back</button>
              <button onClick={() => setStep(3)} className="px-5 py-2.5 bg-[#00ff88] hover:bg-[#00e07a] text-black text-sm font-semibold rounded-lg">Review →</button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
            <h2 className="text-white font-semibold text-lg mb-5">Review & Submit</h2>
            <div className="space-y-3 mb-6">
              {[
                ['Full Name', form.full_name],
                ['Email', form.email],
                ['Phone', form.phone],
                ['Business Name', form.business_name],
                ['Business Type', form.business_type],
                ['Monthly Volume', form.monthly_volume_usd ? `$${form.monthly_volume_usd}` : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between py-2 border-b border-[#1e1e2e]">
                  <span className="text-sm text-[#666]">{label}</span>
                  <span className="text-sm text-white">{val || <span className="text-red-400">Missing</span>}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-[#1e1e2e]">
                <span className="text-sm text-[#666]">Documents</span>
                <span className="text-sm text-white">{sub?.documents?.length || 0} / 3 uploaded</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-sm rounded-lg">← Back</button>
              {canEdit && (
                <button onClick={handleSubmit} disabled={submitting}
                  className="px-6 py-2.5 bg-[#00ff88] hover:bg-[#00e07a] text-black text-sm font-semibold rounded-lg disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Submit KYC Application'}
                </button>
              )}
              {!canEdit && sub?.status !== 'draft' && (
                <div className="text-sm text-[#666] py-2.5">Application already submitted.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
