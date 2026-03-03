import { useState, useEffect } from 'react'
import {
  collection, doc, onSnapshot, addDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, Timestamp
} from 'firebase/firestore'
import { db } from './firebase'

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_PIN = '2552' // Změň na svůj admin PIN!

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '—'
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts)
  return d.toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timeDiff(ts) {
  if (!ts) return ''
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts)
  const ms = Date.now() - d.getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h} hod ${m} min` : `${m} min`
}
function isOvernight(ts) {
  if (!ts) return false
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts)
  return Date.now() - d.getTime() > 8 * 3600000
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('customer') // customer | admin
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [riders, setRiders] = useState([])
  const [checkins, setCheckins] = useState([])
  const [loading, setLoading] = useState(true)

  // Realtime listeners
  useEffect(() => {
    const unsubRiders = onSnapshot(collection(db, 'riders'), snap => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    const unsubCheckins = onSnapshot(
      query(collection(db, 'checkins'), orderBy('inAt', 'desc')),
      snap => setCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { unsubRiders(); unsubCheckins() }
  }, [])

  const activeCheckins = checkins.filter(c => !c.outAt)
  const history = checkins.filter(c => c.outAt)

  async function handleCheckin(riderId, name) {
    await addDoc(collection(db, 'checkins'), {
      riderId, name, inAt: serverTimestamp(), outAt: null
    })
  }
  async function handleCheckout(riderId) {
    const active = activeCheckins.find(c => c.riderId === riderId)
    if (active) {
      await updateDoc(doc(db, 'checkins', active.id), { outAt: serverTimestamp() })
    }
  }
  async function forceCheckout(checkinId) {
    await updateDoc(doc(db, 'checkins', checkinId), {
      outAt: serverTimestamp(), forcedByAdmin: true
    })
  }
  async function addRider(name, pin) {
    await addDoc(collection(db, 'riders'), { name, pin })
  }
  async function updateRider(id, data) {
    await updateDoc(doc(db, 'riders', id), data)
  }
  async function deleteRider(id) {
    await deleteDoc(doc(db, 'riders', id))
  }

  if (loading) return (
    <div style={S.loading}>
      <div style={S.spinner} />
      <p style={{ color: '#888', marginTop: 16, fontFamily: 'sans-serif' }}>Načítám...</p>
    </div>
  )

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Tab bar */}
      <div style={S.tabBar}>
        <button style={{ ...S.tab, ...(view === 'customer' ? S.tabActive : {}) }}
          onClick={() => setView('customer')}>
          Jezdec
        </button>
        <button style={{ ...S.tab, ...(view === 'admin' ? S.tabActive : {}) }}
          onClick={() => {
            if (!adminAuthed) {
              const pin = prompt('Admin PIN:')
              if (pin === ADMIN_PIN) { setAdminAuthed(true); setView('admin') }
              else if (pin !== null) alert('Špatný PIN')
            } else {
              setView('admin')
            }
          }}>
          ⚙️ Admin {activeCheckins.length > 0 && <span style={S.badge}>{activeCheckins.length}</span>}
        </button>
      </div>

      {view === 'customer' ? (
        <CustomerView
          riders={riders}
          activeCheckins={activeCheckins}
          onCheckin={handleCheckin}
          onCheckout={handleCheckout}
        />
      ) : (
        <AdminView
          riders={riders}
          activeCheckins={activeCheckins}
          history={history}
          onForceCheckout={forceCheckout}
          onAddRider={addRider}
          onUpdateRider={updateRider}
          onDeleteRider={deleteRider}
          onLogout={() => { setAdminAuthed(false); setView('customer') }}
        />
      )}
    </div>
  )
}

// ─── Customer View ────────────────────────────────────────────────────────────
function CustomerView({ riders, activeCheckins, onCheckin, onCheckout }) {
  const [step, setStep] = useState('pick') // pick | pin | done
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState(null) // in | out
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  function reset() { setStep('pick'); setSelected(null); setPin(''); setAction(null); setError(''); setSearch('') }

  function selectRider(r) {
    const isIn = activeCheckins.some(c => c.riderId === r.id)
    setSelected(r)
    setAction(isIn ? 'out' : 'in')
    setPin(''); setError('')
    setStep('pin')
  }

  function handleDigit(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) setTimeout(() => verify(next), 150)
  }

  async function verify(p) {
    if (p !== selected.pin) {
      setShake(true); setPin(''); setError('Špatný PIN ✕')
      setTimeout(() => { setShake(false); setError('') }, 700)
      return
    }
    setBusy(true)
    if (action === 'in') await onCheckin(selected.id, selected.name)
    else await onCheckout(selected.id)
    setBusy(false)
    setStep('done')
  }

  if (step === 'done') return (
    <div style={S.doneWrap}>
      <div style={{ fontSize: 72 }}>{action === 'in' ? '🟢' : '🏁'}</div>
      <h2 style={S.doneTitle}>{action === 'in' ? 'Příjezd zaznamenán!' : 'Odjezd zaznamenán!'}</h2>
      <p style={{ color: '#888', textAlign: 'center' }}>{selected?.name}</p>
      <button style={S.doneBtn} onClick={reset}>← Zpět na seznam</button>
    </div>
  )

  if (step === 'pin') return (
    <div style={S.pinWrap}>
      <button style={S.backBtn} onClick={reset}>← Zpět</button>
      <div style={{ fontSize: 52, marginBottom: 4 }}>
        {action === 'in' ? '🏍️' : '👋'}
      </div>
      <div style={S.pinTitle}>{selected?.name}</div>
      <div style={S.pinSub}>{action === 'in' ? 'Zadej PIN pro příjezd' : 'Zadej PIN pro odjezd'}</div>

      <div style={{ ...S.pinDots, ...(shake ? S.shake : {}) }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...S.pinDot, ...(pin.length > i ? S.pinDotFilled : {}) }} />
        ))}
      </div>
      {error && <div style={S.pinError}>{error}</div>}

      <div style={S.numpad}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
          k === '' ? <div key={i} /> :
          <button key={i} style={S.numKey} onClick={() => k === '⌫' ? setPin(p => p.slice(0,-1)) : handleDigit(String(k))}>
            {k}
          </button>
        ))}
      </div>
      {busy && <div style={{ color: '#888', marginTop: 16 }}>Ukládám...</div>}
    </div>
  )

  // Sort: active first, then alphabetically
  const sortedRiders = [...riders].sort((a, b) => {
    const aActive = activeCheckins.some(c => c.riderId === a.id)
    const bActive = activeCheckins.some(c => c.riderId === b.id)
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return a.name.localeCompare(b.name, 'cs')
  })
  const filtered = sortedRiders.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={S.customerWrap}>
      <h1 style={S.heroTitle}>Trial Park Sklenka</h1>

      {/* Search box - prominent, autofocus */}
      <div style={S.searchWrap}>
        <span style={S.searchIcon}>🔍</span>
        <input
          style={S.searchInput}
          placeholder="Napiš své jméno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
        />
        {search.length > 0 && (
          <button style={S.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {activeCheckins.length > 0 && search === '' && (
        <div style={S.onTrackBar}>
          🟢 Na pozemku: <strong>{activeCheckins.length} jezdců</strong>
        </div>
      )}

      <div style={S.riderList}>
        {riders.length === 0 && <p style={{ color: '#888', textAlign: 'center', marginTop: 32 }}>Žádní jezdci nejsou přidáni.<br/>Požádej admina.</p>}
        {filtered.length === 0 && riders.length > 0 && (
          <p style={{ color: '#888', textAlign: 'center', marginTop: 32 }}>Jméno „{search}" nenalezeno.</p>
        )}
        {filtered.map(r => {
          const active = activeCheckins.some(c => c.riderId === r.id)
          return (
            <button key={r.id} style={{ ...S.riderBtn, ...(active ? S.riderBtnActive : {}) }} onClick={() => selectRider(r)}>
              <div style={{ ...S.riderAvatar, background: active ? '#4caf50' : '#f0a500' }}>
                {r.name.trim()[0]?.toUpperCase()}
              </div>
              <span style={S.riderName}>{r.name}</span>
              {active
                ? <span style={S.riderBadgeOn}>NA MÍSTĚ</span>
                : <span style={S.riderBadgeOff}>Příjezd →</span>
              }
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Admin View ───────────────────────────────────────────────────────────────
function AdminView({ riders, activeCheckins, history, onForceCheckout, onAddRider, onUpdateRider, onDeleteRider, onLogout }) {
  const [tab, setTab] = useState('live')
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [editId, setEditId] = useState(null)
  const [editPin, setEditPin] = useState('')
  const [editName, setEditName] = useState('')
  const [searchLive, setSearchLive] = useState('')
  const [searchHistory, setSearchHistory] = useState('')
  const [searchRiders, setSearchRiders] = useState('')
  const overnight = activeCheckins.filter(c => isOvernight(c.inAt))

  async function addRider() {
    if (!newName.trim() || newPin.length < 4) return
    await onAddRider(newName.trim(), newPin)
    setNewName(''); setNewPin('')
  }
  async function saveEdit(id) {
    const updates = {}
    if (editName.trim()) updates.name = editName.trim()
    if (editPin.length >= 4) updates.pin = editPin
    if (Object.keys(updates).length) await onUpdateRider(id, updates)
    setEditId(null)
  }

  return (
    <div style={S.adminWrap}>
      <div style={S.adminHeader}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>⚙️ Admin</span>
        <button style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }} onClick={onLogout}>Odhlásit</button>
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statNum}>{activeCheckins.length}</div>
          <div style={S.statLabel}>Na pozemku</div>
        </div>
        <div style={{ ...S.statCard, ...(overnight.length > 0 ? S.statWarn : {}) }}>
          <div style={{ ...S.statNum, color: overnight.length > 0 ? '#f44336' : '#f0a500' }}>{overnight.length}</div>
          <div style={S.statLabel}>⚠️ Přes noc</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statNum}>{history.length}</div>
          <div style={S.statLabel}>Návštěv celkem</div>
        </div>
      </div>

      {overnight.length > 0 && (
        <div style={S.alertBox}>⚠️ Pozor — někdo je na pozemku déle než 8 hodin!</div>
      )}

      {/* Sub tabs */}
      <div style={S.subTabs}>
        {['live','history','riders'].map(t => (
          <button key={t} style={{ ...S.subTab, ...(tab === t ? S.subTabActive : {}) }} onClick={() => setTab(t)}>
            {{ live: '🟢 Živě', history: '📋 Historie', riders: '👥 Jezdci' }[t]}
          </button>
        ))}
      </div>

      {/* Live */}
      {tab === 'live' && (
        <div style={S.section}>
          <div style={S.adminSearchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input style={S.adminSearchInput} placeholder="Hledat jméno..." value={searchLive}
              onChange={e => setSearchLive(e.target.value)} autoComplete="off" />
            {searchLive && <button style={S.searchClear} onClick={() => setSearchLive('')}>✕</button>}
          </div>
          {activeCheckins.length === 0
            ? <p style={S.emptyMsg}>Nikdo momentálně není na místě.</p>
            : activeCheckins
                .filter(c => c.name?.toLowerCase().includes(searchLive.toLowerCase()))
                .map(c => (
              <div key={c.id} style={{ ...S.card, ...(isOvernight(c.inAt) ? S.cardWarn : {}) }}>
                <div style={{ ...S.avatar, background: isOvernight(c.inAt) ? '#f44336' : '#4caf50' }}>
                  {c.name?.trim()[0]?.toUpperCase()}
                </div>
                <div style={S.cardInfo}>
                  <span style={S.cardName}>{c.name}</span>
                  <span style={S.cardSub}>od {fmtTime(c.inAt)} · {timeDiff(c.inAt)}</span>
                  {isOvernight(c.inAt) && <span style={{ color: '#f44336', fontSize: 12, fontWeight: 700 }}>⚠️ Přes noc!</span>}
                </div>
                <button style={S.btnDanger} onClick={() => onForceCheckout(c.id)}>Odhlásit</button>
              </div>
            ))
          }
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div style={S.section}>
          <div style={S.adminSearchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input style={S.adminSearchInput} placeholder="Hledat jméno..." value={searchHistory}
              onChange={e => setSearchHistory(e.target.value)} autoComplete="off" />
            {searchHistory && <button style={S.searchClear} onClick={() => setSearchHistory('')}>✕</button>}
          </div>
          {history.length === 0
            ? <p style={S.emptyMsg}>Žádná historie.</p>
            : history
                .filter(c => c.name?.toLowerCase().includes(searchHistory.toLowerCase()))
                .map(c => (
              <div key={c.id} style={{ ...S.card, opacity: 0.8 }}>
                <div style={S.avatar}>{c.name?.trim()[0]?.toUpperCase()}</div>
                <div style={S.cardInfo}>
                  <span style={S.cardName}>{c.name}</span>
                  <span style={S.cardSub}>{fmtDateTime(c.inAt)} → {fmtTime(c.outAt)}</span>
                  {c.forcedByAdmin && <span style={{ color: '#888', fontSize: 11 }}>odhlásil admin</span>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Riders management */}
      {tab === 'riders' && (
        <div style={S.section}>
          <div style={S.adminSearchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input style={S.adminSearchInput} placeholder="Hledat jezdce..." value={searchRiders}
              onChange={e => setSearchRiders(e.target.value)} autoComplete="off" />
            {searchRiders && <button style={S.searchClear} onClick={() => setSearchRiders('')}>✕</button>}
          </div>
          <div style={S.addCard}>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 10 }}>Přidat nového jezdce:</p>
            <input style={S.input} placeholder="Celé jméno" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={S.input} placeholder="PIN (4 číslice)" inputMode="numeric" maxLength={4}
              value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} />
            <button style={S.btnAdd} onClick={addRider}>+ Přidat jezdce</button>
          </div>

          {riders.filter(r => r.name?.toLowerCase().includes(searchRiders.toLowerCase())).map(r => (
            <div key={r.id} style={S.card}>
              <div style={S.avatar}>{r.name?.trim()[0]?.toUpperCase()}</div>
              <div style={S.cardInfo}>
                {editId === r.id ? (
                  <>
                    <input style={{ ...S.input, padding: '6px 10px', fontSize: 14, marginBottom: 4 }}
                      placeholder="Nové jméno" value={editName} onChange={e => setEditName(e.target.value)} />
                    <input style={{ ...S.input, padding: '6px 10px', fontSize: 14 }}
                      placeholder="Nový PIN" inputMode="numeric" maxLength={4}
                      value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))} />
                  </>
                ) : (
                  <>
                    <span style={S.cardName}>{r.name}</span>
                    <span style={S.cardSub}>PIN: {'•'.repeat(r.pin?.length || 4)}</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {editId === r.id ? (
                  <>
                    <button style={S.btnAdd} onClick={() => saveEdit(r.id)}>✓</button>
                    <button style={S.btnDanger} onClick={() => setEditId(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <button style={S.btnEdit} onClick={() => { setEditId(r.id); setEditPin(''); setEditName(r.name) }}>✏️</button>
                    <button style={S.btnDanger} onClick={() => onDeleteRider(r.id)}>🗑</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", background: '#0d0d0d', minHeight: '100vh', color: '#f0f0f0', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d0d' },
  spinner: { width: 44, height: 44, borderRadius: '50%', border: '4px solid #2a2a2a', borderTopColor: '#f0a500', animation: 'spin 0.8s linear infinite' },

  tabBar: { display: 'flex', borderBottom: '2px solid #2a2a2a', background: '#161616', position: 'sticky', top: 0, zIndex: 10 },
  tab: { flex: 1, padding: '14px 0', background: 'none', border: 'none', color: '#888', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: 0.5, position: 'relative' },
  tabActive: { color: '#f0a500', borderBottom: '3px solid #f0a500', marginBottom: -2 },
  badge: { background: '#f44336', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700, marginLeft: 4 },

  customerWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 40px' },
  heroTitle: { fontSize: 34, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#f0a500', margin: '0 0 4px' },
  heroSub: { color: '#888', fontSize: 15, marginBottom: 12 },
  searchWrap: { display: 'flex', alignItems: 'center', width: '100%', background: '#1e1e1e', border: '2px solid #f0a500', borderRadius: 14, padding: '0 14px', marginBottom: 12, gap: 8 },
  searchIcon: { fontSize: 18, flexShrink: 0 },
  searchInput: { flex: 1, background: 'none', border: 'none', color: '#f0f0f0', fontSize: 18, padding: '14px 0', fontFamily: 'inherit', outline: 'none' },
  searchClear: { background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer', padding: '0 0 0 8px', flexShrink: 0 },
  onTrackBar: { width: '100%', background: '#0a150a', border: '1px solid #4caf50', borderRadius: 10, padding: '8px 14px', color: '#4caf50', fontSize: 14, marginBottom: 12 },
  riderList: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10 },
  riderBtn: { display: 'flex', alignItems: 'center', gap: 14, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 14, padding: '14px 18px', cursor: 'pointer', color: '#f0f0f0', fontFamily: 'inherit', fontSize: 18, fontWeight: 600, letterSpacing: 0.3, textAlign: 'left' },
  riderBtnActive: { borderColor: '#4caf50', background: '#0a150a' },
  riderAvatar: { width: 42, height: 42, borderRadius: '50%', background: '#f0a500', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 },
  riderName: { flex: 1 },
  riderBadgeOn: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#4caf50', border: '1px solid #4caf50', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  riderBadgeOff: { fontSize: 13, color: '#555', whiteSpace: 'nowrap' },

  pinWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px 40px' },
  backBtn: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#888', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16, padding: 0 },
  pinTitle: { fontSize: 26, fontWeight: 700, marginBottom: 4 },
  pinSub: { color: '#888', fontSize: 15, marginBottom: 24 },
  pinDots: { display: 'flex', gap: 16, marginBottom: 8 },
  pinDot: { width: 20, height: 20, borderRadius: '50%', background: '#2a2a2a', transition: 'background 0.15s' },
  pinDotFilled: { background: '#f0a500' },
  pinError: { color: '#f44336', fontSize: 14, marginBottom: 8 },
  shake: { animation: 'shake 0.4s ease' },
  numpad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', maxWidth: 280, marginTop: 16 },
  numKey: { height: 70, borderRadius: 14, border: '1px solid #2a2a2a', background: '#1e1e1e', color: '#f0f0f0', fontSize: 26, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'background 0.1s' },

  doneWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  doneTitle: { fontSize: 28, fontWeight: 800, letterSpacing: 1, textAlign: 'center' },
  doneBtn: { marginTop: 24, padding: '16px 48px', background: '#f0a500', color: '#000', border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: 1 },

  adminWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '0 14px 40px' },
  adminHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 10px' },
  statsRow: { display: 'flex', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #2a2a2a', background: '#161616' },
  statWarn: { borderColor: '#f44336', background: '#1a0808' },
  statNum: { fontSize: 44, fontWeight: 800, lineHeight: 1, color: '#f0a500' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4, letterSpacing: 0.5, textAlign: 'center' },
  alertBox: { background: '#1a0808', border: '1px solid #f44336', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#f44336', fontSize: 14 },
  subTabs: { display: 'flex', gap: 8, marginBottom: 14 },
  subTab: { flex: 1, padding: '10px 0', background: '#161616', border: '1px solid #2a2a2a', borderRadius: 10, color: '#888', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  subTabActive: { background: '#1e1e1e', borderColor: '#f0a500', color: '#f0a500' },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  emptyMsg: { color: '#888', textAlign: 'center', marginTop: 32, fontSize: 16 },

  card: { display: 'flex', alignItems: 'center', gap: 12, background: '#161616', borderRadius: 14, padding: 14, border: '1px solid #2a2a2a' },
  cardWarn: { borderColor: '#f44336', background: '#1a0808' },
  avatar: { width: 42, height: 42, borderRadius: '50%', background: '#f0a500', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, flexShrink: 0 },
  cardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  cardName: { fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardSub: { fontSize: 13, color: '#888' },

  addCard: { background: '#161616', border: '1px dashed #2a2a2a', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  input: { background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 9, padding: '11px 14px', color: '#f0f0f0', fontSize: 16, fontFamily: 'inherit', width: '100%' },
  btnAdd: { background: '#f0a500', color: '#000', border: 'none', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  btnDanger: { background: '#1a0808', border: '1px solid #f44336', color: '#f44336', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 },
  btnEdit: { background: '#1e1600', border: '1px solid #f0a500', color: '#f0a500', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 },
  adminSearchWrap: { display: 'flex', alignItems: 'center', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0 12px', marginBottom: 10, gap: 8 },
  adminSearchInput: { flex: 1, background: 'none', border: 'none', color: '#f0f0f0', fontSize: 15, padding: '11px 0', fontFamily: 'inherit', outline: 'none' },
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0d0d; }
  button:active { opacity: 0.75; transform: scale(0.97); }
  input { outline: none; }
  input::placeholder { color: #555; }
`
