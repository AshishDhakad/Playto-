import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api'

const STATUS_STYLES = {
  submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  under_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  approved: 'bg-green-500/10 text-[#00ff88] border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  more_info_requested: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  draft: 'bg-[#1a1a2e] text-[#888] border-[#2a2a3e]',
}

const TRANSITIONS = {
  submitted:            [{ label: 'Start Review', value: 'under_review', color: 'blue' }],
  under_review:         [
    { label: '✓ Approve',       value: 'approved',            color: 'green'  },
    { label: '✕ Reject',        value: 'rejected',            color: 'red'    },
    { label: '⚑ Request Info',  value: 'more_info_requested', color: 'orange' },
  ],
  more_info_requested:  [],
  approved:             [],
  rejected:             [],
  draft:                [],
}

const BTN_COLORS = {
  green:  'bg-green-500/10 border-green-500/20 text-[#00ff88] hover:bg-green-500/20',
  red:    'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20',
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20',
}

const DOC_LABELS = {
  pan:            'PAN Card',
  aadhaar:        'Aadhaar Card',
  bank_statement: 'Bank Statement',
}

// File type icon
function FileIcon({ mime }) {
  if (mime === 'application/pdf') return <span className="text-red-400">PDF</span>
  if (mime?.startsWith('image/'))  return <span className="text-blue-400">IMG</span>
  return <span className="text-[#555]">FILE</span>
}

export default function ReviewDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)  // for in-page preview

  useEffect(() => { fetchSub() }, [id])

  const fetchSub = async () => {
    try {
      const res = await api.get(`/reviewer/submissions/${id}/`)
      setSub(res.data)
    } catch {
      setError('Submission not found.')
    } finally {
      setLoading(false)
    }
  }

  const doTransition = async (newStatus) => {
    setTransitioning(true); setError(''); setSuccess('')
    try {
      const res = await api.post(`/reviewer/submissions/${id}/transition/`, {
        new_status: newStatus, note
      })
      setSub(res.data)
      setSuccess(`Status updated to: ${newStatus.replace(/_/g, ' ')}`)
      setNote('')
    } catch (e) {
      const errs = e.response?.data?.errors?.new_status || e.response?.data?.error
      setError(Array.isArray(errs) ? errs[0] : errs || 'Transition failed.')
    } finally {
      setTransitioning(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!sub) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-[#555]">{error}</div>
  )

  const actions = TRANSITIONS[sub.status] || []

  return (
    <div className="min-h-screen bg-[#0a0a0f]">

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}>
          <div className="bg-[#111118] border border-[#2a2a3e] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
              <div>
                <div className="text-white text-sm font-medium">{DOC_LABELS[previewDoc.doc_type]}</div>
                <div className="text-xs text-[#555] mt-0.5">{previewDoc.original_filename}</div>
              </div>
              <div className="flex items-center gap-3">
                <a href={previewDoc.file_url} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-[#1e1e2e] border border-[#2a2a3e] text-[#888] hover:text-white rounded-lg transition-colors">
                  Open in new tab ↗
                </a>
                <button onClick={() => setPreviewDoc(null)}
                  className="text-[#555] hover:text-white transition-colors text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="overflow-auto" style={{ height: 'calc(90vh - 80px)' }}>
              {previewDoc.mime_type === 'application/pdf' ? (
                <iframe
                  src={previewDoc.file_url}
                  className="w-full h-full border-0"
                  title={previewDoc.original_filename}
                />
              ) : previewDoc.mime_type?.startsWith('image/') ? (
                <div className="flex items-center justify-center p-6 h-full">
                  <img
                    src={previewDoc.file_url}
                    alt={previewDoc.original_filename}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[#555]">
                  <div className="text-center">
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-sm">Cannot preview this file type.</div>
                    <a href={previewDoc.file_url} target="_blank" rel="noreferrer"
                      className="mt-3 inline-block text-[#00ff88] text-sm hover:underline">
                      Download file ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="border-b border-[#1e1e2e] px-6 py-4 flex items-center gap-4">
        <Link to="/reviewer" className="text-[#555] hover:text-white transition-colors text-sm">← Queue</Link>
        <span className="text-[#2a2a3e]">/</span>
        <span className="text-white text-sm">{sub.merchant_username}</span>
        <div className="ml-auto flex items-center gap-2">
          {sub.is_sla_at_risk && (
            <span className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">⚠ SLA at risk</span>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[sub.status]}`}>
            {sub.status?.replace(/_/g, ' ')}
          </span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left column — details */}
        <div className="md:col-span-2 space-y-5">
          {error   && <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
          {success && <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-lg text-[#00ff88] text-sm">{success}</div>}

          {/* Personal */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
            <h3 className="text-xs text-[#555] uppercase tracking-wider mb-4">Personal Details</h3>
            <div className="space-y-3">
              {[['Full Name', sub.full_name], ['Email', sub.email], ['Phone', sub.phone]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-[#0f0f1a]">
                  <span className="text-sm text-[#555]">{l}</span>
                  <span className="text-sm text-white">{v || <span className="text-[#333]">—</span>}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Business */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
            <h3 className="text-xs text-[#555] uppercase tracking-wider mb-4">Business Details</h3>
            <div className="space-y-3">
              {[
                ['Business Name', sub.business_name],
                ['Business Type', sub.business_type],
                ['Monthly Volume', sub.monthly_volume_usd ? `$${sub.monthly_volume_usd}` : null],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-[#0f0f1a]">
                  <span className="text-sm text-[#555]">{l}</span>
                  <span className="text-sm text-white capitalize">{v || <span className="text-[#333]">—</span>}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
            <h3 className="text-xs text-[#555] uppercase tracking-wider mb-4">
              Documents <span className="text-[#333] normal-case">({sub.documents?.length || 0}/3 uploaded)</span>
            </h3>

            {sub.documents?.length === 0 ? (
              <p className="text-sm text-[#444]">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {sub.documents?.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-4 bg-[#0a0a0f] rounded-xl border border-[#1e1e2e] hover:border-[#2a2a3e] transition-colors">
                    <div className="flex items-center gap-3">
                      {/* File type badge */}
                      <div className="w-10 h-10 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] flex items-center justify-center text-xs font-bold">
                        <FileIcon mime={doc.mime_type} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{DOC_LABELS[doc.doc_type] || doc.doc_type}</div>
                        <div className="text-xs text-[#444] mt-0.5">
                          {doc.original_filename} · {(doc.file_size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Preview button — opens modal */}
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="text-xs px-3 py-1.5 bg-[#1a1a2e] border border-[#2a2a3e] text-[#888] hover:text-[#00ff88] hover:border-[#00ff88] rounded-lg transition-colors"
                      >
                        Preview
                      </button>
                      {/* Download button — direct link */}
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        download={doc.original_filename}
                        className="text-xs px-3 py-1.5 bg-[#1a1a2e] border border-[#2a2a3e] text-[#888] hover:text-white hover:border-[#444] rounded-lg transition-colors"
                      >
                        Download ↓
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Show missing docs */}
            {['pan','aadhaar','bank_statement'].filter(dt => !sub.documents?.find(d => d.doc_type === dt)).map(dt => (
              <div key={dt} className="mt-2 flex items-center gap-3 p-3 bg-[#0a0a0f] rounded-xl border border-dashed border-[#2a2a3e] opacity-40">
                <div className="w-10 h-10 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] flex items-center justify-center text-xs text-[#444]">
                  ?
                </div>
                <span className="text-sm text-[#444]">{DOC_LABELS[dt]} — not uploaded</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
            <h3 className="text-xs text-[#555] uppercase tracking-wider mb-4">Timeline</h3>
            <div className="space-y-2">
              {[
                ['Created',        sub.created_at],
                ['Submitted',      sub.submitted_at],
                ['Review Started', sub.review_started_at],
                ['Decided',        sub.decided_at],
              ].filter(([, v]) => v).map(([l, v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-[#0f0f1a]">
                  <span className="text-sm text-[#555]">{l}</span>
                  <span className="text-sm text-white" style={{fontFamily:'monospace'}}>
                    {new Date(v).toLocaleString()}
                  </span>
                </div>
              ))}
              {sub.time_in_queue_hours != null && (
                <div className="flex justify-between pt-2">
                  <span className="text-sm text-[#555]">Time in queue</span>
                  <span className={`text-sm font-medium ${sub.is_sla_at_risk ? 'text-red-400' : 'text-white'}`}>
                    {sub.time_in_queue_hours}h {sub.is_sla_at_risk ? '⚠ SLA at risk' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column — actions */}
        <div>
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 sticky top-6">
            <h3 className="text-xs text-[#555] uppercase tracking-wider mb-4">Actions</h3>

            {sub.reviewer_note && (
              <div className="mb-4 p-3 bg-[#0a0a0f] rounded-lg border border-[#2a2a3e]">
                <div className="text-xs text-[#555] mb-1">Previous note</div>
                <div className="text-sm text-[#888]">{sub.reviewer_note}</div>
              </div>
            )}

            {actions.length > 0 ? (
              <>
                <textarea
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00ff88] transition-colors resize-none mb-4"
                  rows={3}
                  placeholder="Add a reviewer note (optional)..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <div className="space-y-2">
                  {actions.map(({ label, value, color }) => (
                    <button key={value} onClick={() => doTransition(value)} disabled={transitioning}
                      className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${BTN_COLORS[color]}`}>
                      {transitioning ? 'Updating...' : label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-[#444] text-center py-6">
                No actions available.<br/>
                <span className="text-xs text-[#333] capitalize">{sub.status?.replace(/_/g, ' ')} is a terminal state.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
