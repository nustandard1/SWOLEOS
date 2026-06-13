// FORGE prototype — Home, Workout Logger, Exercise Picker, Tab Bar, History, Profile.
const { useState: useS, useEffect: useE, useRef: useR } = React;

const EXERCISES = [
  { n: 'Bench Press', m: 'Chest' }, { n: 'Incline DB Press', m: 'Chest' }, { n: 'Cable Fly', m: 'Chest' },
  { n: 'Dips', m: 'Chest' }, { n: 'Overhead Press', m: 'Delts' }, { n: 'Lateral Raise', m: 'Delts' },
  { n: 'Rear Delt Fly', m: 'Delts' }, { n: 'Pull-Up', m: 'Back' }, { n: 'Barbell Row', m: 'Back' },
  { n: 'Lat Pulldown', m: 'Back' }, { n: 'Seated Cable Row', m: 'Back' }, { n: 'Deadlift', m: 'Back' },
  { n: 'Back Squat', m: 'Quads' }, { n: 'Leg Press', m: 'Quads' }, { n: 'Leg Extension', m: 'Quads' },
  { n: 'Romanian Deadlift', m: 'Hamstrings' }, { n: 'Leg Curl', m: 'Hamstrings' }, { n: 'Hip Thrust', m: 'Glutes' },
  { n: 'Calf Raise', m: 'Calves' }, { n: 'Barbell Curl', m: 'Arms' }, { n: 'Hammer Curl', m: 'Arms' },
  { n: 'Tricep Pushdown', m: 'Arms' }, { n: 'Skullcrusher', m: 'Arms' }, { n: 'Hanging Leg Raise', m: 'Abs' },
];
const MUSCLE_TABS = ['All', 'Chest', 'Back', 'Delts', 'Arms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : '' + n;

// ── TAB BAR ───────────────────────────────────────────────────
function TabBar({ active, onNav, onStart }) {
  const Tab = ({ id, icon, label }) => (
    <button className={'tab' + (active === id ? ' on' : '')} onClick={() => onNav(id)}>
      <Icon name={icon} size={23} stroke={active === id ? '#FF5A1E' : '#6E665A'} sw={active === id ? 2.3 : 2} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="tabbar">
      <Tab id="home" icon="home" label="Home" />
      <Tab id="history" icon="history" label="History" />
      <button className="tab-fab" onClick={onStart}><Icon name="plus" size={26} stroke="#0C0B0A" sw={2.6} /></button>
      <Tab id="profile" icon="user" label="Profile" />
      <Tab id="ideas" icon="bolt" label="Train" />
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────
function Home({ profile, stats, last, onStart }) {
  const bars = [40, 0, 62, 78, 0, 55, 90];
  return (
    <div className="scr">
      <div className="scr-scroll">
        <div className="fg-topbar">
          <SlashWordmark size={18} />
          <div className="fg-chip">FREE</div>
        </div>

        <div className="fg-sec">
          <div className="kicker" style={{ marginBottom: 4 }}>{greeting()}</div>
          <div className="disp" style={{ fontSize: 44 }}>{profile.name}</div>
        </div>

        <button className="fg-cta" onClick={onStart}>
          <div className="fg-cta-lft">
            <div className="fg-cta-k">START WORKOUT</div>
            <div className="fg-cta-sub">Push Day · ready when you are</div>
          </div>
          <div className="fg-cta-arw"><Icon name="arrow" size={22} stroke="#FF5A1E" /></div>
        </button>

        <div className="fg-sec">
          <div className="fg-rule"><span className="kicker">This Week</span><span className="ln"></span></div>
          <div className="fg-stats">
            <div className="fg-stat"><div className="v">{String(stats.workouts).padStart(2, '0')}</div><div className="l kicker">Workouts</div></div>
            <div className="fg-stat"><div className="v">{stats.hardSets}</div><div className="l kicker">Hard Sets</div></div>
            <div className="fg-stat"><div className="v">{fmtK(stats.volume)}<span className="u"></span></div><div className="l kicker">Volume</div></div>
          </div>
          <div className="fg-bars">
            {bars.map((h, i) => <div key={i} className={'b' + (h > 70 ? ' on' : '')} style={{ height: Math.max(h, 6) + '%' }}></div>)}
          </div>
        </div>

        <div className="fg-sec">
          <div className="fg-rule"><span className="kicker">Last Session</span><span className="ln"></span><span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{last.when}</span></div>
          <div className="fg-card">
            {last.lifts.map((lf, i) => (
              <div className="fg-lift" key={i}>
                <span className="nm">{lf.n}</span>
                <span className="dt">{lf.top}{lf.up ? <span className="fg-up">&nbsp;▲ {lf.up}</span> : null}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fg-sec" style={{ paddingBottom: 24 }}>
          <div className="fg-rule"><span className="kicker">Intelligence</span><span className="ln"></span></div>
          <div className="fg-intel">
            <div className="bar"></div>
            <div className="fg-intel-h"><span className="fg-dot"></span><span className="kicker" style={{ color: 'var(--acc2)' }}>Progression Target</span></div>
            <div className="disp" style={{ fontSize: 20, marginBottom: 6 }}>Bench Press → add 5 lb</div>
            <div style={{ fontFamily: 'Saira', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              You hit 185×8 at RPE 8 last session. Conditions are right to push to 190 today.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EXERCISE PICKER ───────────────────────────────────────────
function ExercisePicker({ onPick, onClose }) {
  const [q, setQ] = useS('');
  const [mf, setMf] = useS('All');
  const list = EXERCISES.filter(e =>
    (mf === 'All' || e.m === mf) && (!q || e.n.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="picker">
      <div className="picker-head">
        <span className="disp" style={{ fontSize: 24 }}>Add Exercise</span>
        <button className="picker-done" onClick={onClose}>CLOSE</button>
      </div>
      <div className="picker-search">
        <Icon name="search" size={18} stroke="#8C8273" />
        <input className="picker-in" placeholder="Search exercises…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      </div>
      <div className="picker-chips">
        {MUSCLE_TABS.map(m => (
          <button key={m} className={'picker-chip' + (mf === m ? ' on' : '')} onClick={() => setMf(m)}>{m}</button>
        ))}
      </div>
      <div className="picker-list">
        {list.map(e => (
          <button key={e.n} className="picker-row" onClick={() => onPick(e)}>
            <span className="picker-row-n">{e.n}</span>
            <span className="picker-row-m">{e.m}</span>
          </button>
        ))}
        {list.length === 0 && <div className="picker-empty">No matches.</div>}
      </div>
    </div>
  );
}

// ── WORKOUT LOGGER ────────────────────────────────────────────
function mkSet(ghost, type) { return { type: type || 'normal', w: '', r: '', rpe: '', minis: [], done: false, ghost: ghost || null }; }
function fmtClock(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function setVolume(s) {
  if (s.type === 'warmup') return 0;
  const w = +s.w || 0;
  if (s.type === 'cluster' || s.type === 'myo') return w * s.minis.reduce((a, m) => a + (+m || 0), 0);
  return w * (+s.r || 0);
}

function Logger({ onFinish, onCancel }) {
  const [name, setName] = useS('Push Day');
  const [exs, setExs] = useS([
    {
      n: 'Bench Press', m: 'Chest', last: '185×8 · 185×8 · 175×9', linkPrev: false, note: 'Arch set, feet back. Pause on chest.', adv: false,
      target: '+5 lb vs last · on pace for a PR',
      sets: [
        mkSet({ w: '135', r: '10' }, 'warmup'),
        mkSet({ w: '185', r: '8' }), mkSet({ w: '185', r: '8' }), mkSet({ w: '175', r: '9' }),
      ],
    },
  ]);
  const [sel, setSel] = useS(null);      // {ex, set, field, mi}
  const [picker, setPicker] = useS(false);
  const [secs, setSecs] = useS(1458);
  const [rest, setRest] = useS(null);    // {remaining, duration}
  const [swipe, setSwipe] = useS({ key: null, dx: 0 });
  const [menu, setMenu] = useS(null);        // {ex, set} → set-options sheet
  const [noteT, setNoteT] = useS(null);      // {type:'ex',exi} | {type:'session'}
  const [noteDraft, setNoteDraft] = useS('');
  const [sessNote, setSessNote] = useS('');
  const drag = useR(null);

  useE(() => { const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t); }, []);
  useE(() => {
    if (!rest || rest.remaining <= 0) return;
    const t = setInterval(() => setRest(r => (r && r.remaining > 0) ? { ...r, remaining: r.remaining - 1 } : r), 1000);
    return () => clearInterval(t);
  }, [rest]);

  const liveVol = exs.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + (s.done ? setVolume(s) : 0), 0), 0);
  const liveSets = exs.reduce((a, ex) => a + ex.sets.filter(s => s.done && s.type !== 'warmup').length, 0);

  function key(k) {
    if (!sel) return;
    const { ex, set, field, mi } = sel;
    const apply = (cur) => k === 'del' ? cur.slice(0, -1) : k === '.' ? (cur.includes('.') ? cur : (cur || '0') + '.') : (cur + k).slice(0, 5);
    setExs(prev => prev.map((e, i) => i !== ex ? e : {
      ...e,
      sets: e.sets.map((s, j) => {
        if (j !== set) return s;
        if (field === 'mini') return { ...s, minis: s.minis.map((m, x) => x === mi ? apply(m || '') : m) };
        return { ...s, [field]: apply(s[field] || '') };
      }),
    }));
  }
  function setRpe(v) {
    if (!sel) return;
    const { ex, set } = sel;
    setExs(prev => prev.map((e, i) => i !== ex ? e : { ...e, sets: e.sets.map((s, j) => j !== set ? s : { ...s, rpe: v }) }));
  }
  function cycleType(exi, si) {
    setExs(prev => prev.map((ex, i) => i !== exi ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: s.type === 'warmup' ? 'normal' : (s.type === 'normal' ? 'warmup' : s.type) }) }));
  }
  function toggleDone(exi, si) {
    const cur = exs[exi].sets[si];
    const on = !cur.done;
    setExs(prev => prev.map((ex, i) => i !== exi ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => {
        if (j !== si) return s;
        const ns = { ...s, done: on };
        if (on && s.ghost) { if (!ns.w && s.ghost.w) ns.w = s.ghost.w; if (!ns.r && s.ghost.r) ns.r = s.ghost.r; }
        return ns;
      }),
    }));
    if (on && cur.type !== 'warmup') setRest({ remaining: 120, duration: 120 });
  }
  function addSet(exi, type) {
    setExs(prev => prev.map((ex, i) => {
      if (i !== exi) return ex;
      const base = type === 'cluster' ? { ...mkSet(null, 'cluster'), minis: ['', '', ''] }
        : type === 'myo' ? { ...mkSet(null, 'myo'), minis: ['', '', ''] }
        : mkSet(ex.sets[ex.sets.length - 1]?.ghost);
      return { ...ex, sets: [...ex.sets, base] };
    }));
  }
  function addMini(exi, si) { setExs(prev => prev.map((ex, i) => i !== exi ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, minis: [...s.minis, ''] }) })); }
  function removeSet(exi, si) {
    setSwipe({ key: null, dx: 0 }); setSel(null);
    setExs(prev => prev.map((ex, i) => i !== exi ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) }));
  }
  function addExercise(e) { setExs(prev => [...prev, { n: e.n, m: e.m, last: null, linkPrev: false, note: '', adv: false, sets: [mkSet(), mkSet(), mkSet()] }]); setPicker(false); }
  function toggleLink(i) { setExs(prev => prev.map((ex, k) => k === i ? { ...ex, linkPrev: !ex.linkPrev } : ex)); }
  function toggleAdv(i) { setExs(prev => prev.map((ex, k) => k === i ? { ...ex, adv: !ex.adv } : ex)); }
  function setWarmupTo(exi, si, warm) {
    setMenu(null);
    setExs(prev => prev.map((ex, i) => i !== exi ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: warm ? 'warmup' : 'normal' }) }));
  }
  function duplicateSet(exi, si) {
    setMenu(null);
    setExs(prev => prev.map((ex, i) => i !== exi ? ex : { ...ex, sets: [...ex.sets.slice(0, si + 1), { ...ex.sets[si], done: false }, ...ex.sets.slice(si + 1)] }));
  }
  function openNote(target, current) { setNoteT(target); setNoteDraft(current || ''); }
  function saveNote() {
    if (!noteT) return;
    if (noteT.type === 'session') setSessNote(noteDraft.trim());
    else setExs(prev => prev.map((ex, i) => i === noteT.exi ? { ...ex, note: noteDraft.trim() } : ex));
    setNoteT(null); setNoteDraft('');
  }
  // exercise-level progress ticker vs last session's best working set
  function exTicker(ex) {
    let prev = 0, cur = 0;
    ex.sets.forEach(s => {
      if (s.type === 'warmup') return;
      if (s.ghost) prev = Math.max(prev, (+s.ghost.w || 0) * (+s.ghost.r || 0));
      if (s.done) cur = Math.max(cur, (+s.w || 0) * (+s.r || 0));
    });
    if (!prev || !cur || cur <= prev) return null;
    return Math.round((cur - prev) / prev * 100);
  }

  function onDown(e, exi, si) { drag.current = { key: exi + ':' + si, startX: e.clientX, dx: 0 }; }
  function onMove(e) {
    if (!drag.current) return;
    let dx = e.clientX - drag.current.startX;
    if (dx > 0) dx = 0; if (dx < -88) dx = -88;
    drag.current.dx = dx;
    setSwipe({ key: drag.current.key, dx });
  }
  function onUp() {
    if (!drag.current) return;
    const dx = drag.current.dx || 0;
    setSwipe({ key: drag.current.key, dx: dx < -44 ? -76 : 0 });
    drag.current = null;
  }

  // superset grouping
  const gInfo = []; let g = -1;
  exs.forEach((ex, i) => {
    if (i === 0 || !ex.linkPrev) { g++; gInfo[i] = { g, pos: 0 }; }
    else gInfo[i] = { g, pos: gInfo[i - 1].pos + 1 };
  });
  const sizeByG = {}; gInfo.forEach(o => { sizeByG[o.g] = (sizeByG[o.g] || 0) + 1; });
  const letterByG = {}; let L = 0;
  gInfo.forEach(o => { if (sizeByG[o.g] > 1 && letterByG[o.g] === undefined) { letterByG[o.g] = String.fromCharCode(65 + L); L++; } });
  const grpLabel = i => sizeByG[gInfo[i].g] > 1 ? letterByG[gInfo[i].g] + (gInfo[i].pos + 1) : null;
  const inGroup = i => sizeByG[gInfo[i].g] > 1;

  function setNumLabel(sets, i) {
    const s = sets[i];
    if (s.type === 'warmup') return 'W';
    if (s.type === 'cluster') return 'C';
    if (s.type === 'myo') return 'M';
    return '' + (sets.slice(0, i).filter(x => x.type === 'normal').length + 1);
  }
  function cellVal(s, f) {
    if (s[f]) return <span>{s[f]}</span>;
    if (s.ghost && s.ghost[f]) return <span className="gh">{s.ghost[f]}</span>;
    return <span className="gh">{f === 'rpe' ? '—' : f === 'r' ? 'reps' : 'lbs'}</span>;
  }

  function renderSet(ex, exi, s, si) {
    const rowKey = exi + ':' + si;
    const dx = swipe.key === rowKey ? swipe.dx : 0;
    const cell = (f) => (
      <button className={'fg-scell' + (sel && sel.ex === exi && sel.set === si && sel.field === f && sel.mi === undefined ? ' sel' : '') + (s.done && f === 'w' && s.type !== 'warmup' ? ' pr' : '')}
        onClick={() => setSel({ ex: exi, set: si, field: f })}>{cellVal(s, f)}</button>
    );
    const minis = (
      <div className="fg-minis">
        {s.minis.map((m, mi) => (
          <button key={mi}
            className={'fg-mini' + (s.type === 'myo' && mi === 0 ? ' act' : '') + (sel && sel.ex === exi && sel.set === si && sel.field === 'mini' && sel.mi === mi ? ' sel' : '')}
            onClick={() => setSel({ ex: exi, set: si, field: 'mini', mi })}>{m || '–'}</button>
        ))}
        <button className="fg-mini addmini" onClick={() => addMini(exi, si)}>+</button>
      </div>
    );
    return (
      <div className="fg-srow-wrap" key={si}
        onPointerDown={e => onDown(e, exi, si)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button className="fg-srow-del" onClick={() => removeSet(exi, si)}><Icon name="x" size={18} stroke="#fff" sw={2.4} /></button>
        <div className={'fg-srow' + (s.type === 'warmup' ? ' warm' : '') + (s.done ? ' done' : '')} style={{ transform: `translateX(${dx}px)` }}>
          <button className={'fg-snum' + (s.type !== 'normal' ? ' w' : '')} onClick={() => setMenu({ ex: exi, set: si })}>{setNumLabel(ex.sets, si)}<span className="fg-snum-caret">⋯</span></button>
          {cell('w')}
          {(s.type === 'cluster' || s.type === 'myo') ? minis : cell('r')}
          {cell('rpe')}
          <button className={'fg-scheck' + (s.done ? ' on' : '')} onClick={() => toggleDone(exi, si)}>
            <Icon name="check" size={16} stroke={s.done ? '#0C0B0A' : '#574F44'} sw={2.6} />
          </button>
        </div>
      </div>
    );
  }

  const restPct = rest && rest.duration ? Math.max(0, rest.remaining / rest.duration * 100) : 0;

  return (
    <div className="scr">
      <div className="lg-top">
        <button className="lg-cancel" onClick={onCancel}>Cancel</button>
        <div className="lg-meta">
          <span className="lg-vol-big mono">{fmtK(liveVol)} <span className="u">lbs</span></span>
          <span className="lg-vol mono">{liveSets} hard sets logged</span>
        </div>
        <button className="lg-fin" onClick={() => onFinish({ name, volume: liveVol, hardSets: liveSets, exercises: exs, timer: fmtClock(secs) })}>FINISH</button>
      </div>

      <div className="scr-scroll" style={{ paddingBottom: sel ? 340 : (rest ? 104 : 28) }}>
        <div style={{ padding: '16px 18px 0' }}>
          <div className="kicker" style={{ marginBottom: 3 }}>Session</div>
          <input className="lg-name disp" value={name} onChange={e => setName(e.target.value)} />
          {sessNote
            ? <button className="lg-sessnote" onClick={() => openNote({ type: 'session' }, sessNote)}><Icon name="target" size={13} stroke="#8C8273" /><span>{sessNote}</span></button>
            : <button className="lg-sessnote add" onClick={() => openNote({ type: 'session' }, '')}>+ Session note</button>}
        </div>

        {exs.map((ex, exi) => (
          <React.Fragment key={exi}>
            {exi > 0 && (
              <button className={'fg-conn' + (ex.linkPrev ? ' on' : '')} onClick={() => toggleLink(exi)}>
                {ex.linkPrev ? '⛓ SUPERSET' : '+ SUPERSET WITH ABOVE'}
              </button>
            )}
            <div className={'fg-ex' + (inGroup(exi) ? ' super' : '')}>
              <div className="fg-ex-h">
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  {grpLabel(exi) && <span className="fg-grp">{grpLabel(exi)}</span>}
                  <div className="fg-ex-nm">{ex.n}</div>
                  {exTicker(ex) != null && <span className="fg-tick">▲ +{exTicker(ex)}%</span>}
                </div>
                <div className="fg-tag">{ex.m}</div>
              </div>
              {ex.note
                ? <button className="fg-exnote" onClick={() => openNote({ type: 'ex', exi }, ex.note)}><Icon name="target" size={12} stroke="#FF8A3D" /><span>{ex.note}</span><span className="edit">EDIT</span></button>
                : <button className="fg-exnote add" onClick={() => openNote({ type: 'ex', exi }, '')}>+ Add setup note</button>}
              {ex.last && (<div className="fg-ghost"><span className="kicker" style={{ letterSpacing: '.1em' }}>Last</span><span className="t">{ex.last}</span></div>)}
              <div className="fg-thead">
                <span style={{ flex: '0 0 30px' }}>Set</span><span>Weight</span><span>Reps</span><span>RPE</span><span style={{ flex: '0 0 34px' }}></span>
              </div>
              {ex.sets.map((s, si) => renderSet(ex, exi, s, si))}
              {ex.target && <div className="fg-target"><Icon name="target" size={14} stroke="#FF8A3D" /><span className="tt">Target {ex.target}</span></div>}
              <button className="fg-addset-main" onClick={() => addSet(exi)}>+ ADD SET</button>
              <button className="fg-adv-toggle" onClick={() => toggleAdv(exi)}>{ex.adv ? '– Hide advanced' : 'Advanced set types'}</button>
              {ex.adv && (
                <div className="fg-adv-row">
                  <button onClick={() => { addSet(exi, 'cluster'); }}>+ Cluster set</button>
                  <button onClick={() => { addSet(exi, 'myo'); }}>+ Myo-reps</button>
                </div>
              )}
            </div>
          </React.Fragment>
        ))}

        <button className="fg-addex" onClick={() => setPicker(true)}>+ ADD EXERCISE</button>
      </div>

      {rest && (
        <div className={'lg-rest' + (rest.remaining === 0 ? ' over' : '')}>
          <div className="lg-rest-track"><div className="lg-rest-fill" style={{ width: restPct + '%' }}></div></div>
          <div className="lg-rest-row">
            <div className="lg-rest-l">
              <span className="kicker">{rest.remaining === 0 ? 'Rest complete · go' : 'Rest'}</span>
              <span className="lg-rest-time mono">{fmtClock(rest.remaining)}</span>
            </div>
            <div className="lg-rest-ctrls">
              <button className="lg-rest-btn" onClick={() => setRest(r => ({ duration: Math.max(r.duration, r.remaining), remaining: Math.max(0, r.remaining - 15) }))}>−15</button>
              <button className="lg-rest-btn" onClick={() => setRest(r => ({ remaining: r.remaining + 15, duration: r.duration + 15 }))}>+15</button>
              <button className="lg-rest-skip" onClick={() => setRest(null)}>SKIP</button>
            </div>
          </div>
        </div>
      )}

      {sel && (
        <Keypad
          label={sel.field === 'w' ? 'Weight (lbs)' : sel.field === 'rpe' ? 'RPE' : (sel.field === 'mini' ? 'Mini-set reps' : 'Reps')}
          rpe={sel.field === 'rpe'} onChip={v => setRpe(v)} onKey={key} onDone={() => setSel(null)}
        />
      )}
      {picker && <ExercisePicker onPick={addExercise} onClose={() => setPicker(false)} />}

      {menu && (() => {
        const s = exs[menu.ex].sets[menu.set];
        const isWarm = s.type === 'warmup';
        const advanced = s.type === 'cluster' || s.type === 'myo';
        return (
          <div className="sheet-scrim" onClick={() => setMenu(null)}>
            <div className="sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-grab"></div>
              <div className="sheet-title kicker">Set options</div>
              {!advanced && (
                <button className="sheet-row" onClick={() => setWarmupTo(menu.ex, menu.set, !isWarm)}>
                  <Icon name="flame" size={18} stroke="#FF8A3D" /><span>{isWarm ? 'Make working set' : 'Mark as warm-up'}</span>
                </button>
              )}
              <button className="sheet-row" onClick={() => duplicateSet(menu.ex, menu.set)}>
                <Icon name="plus" size={18} stroke="#8C8273" /><span>Duplicate set</span>
              </button>
              <button className="sheet-row danger" onClick={() => removeSet(menu.ex, menu.set)}>
                <Icon name="x" size={18} stroke="#FF5A4A" /><span>Delete set</span>
              </button>
              <button className="sheet-cancel" onClick={() => setMenu(null)}>CANCEL</button>
            </div>
          </div>
        );
      })()}

      {noteT && (
        <div className="sheet-scrim" onClick={() => setNoteT(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grab"></div>
            <div className="sheet-title kicker">{noteT.type === 'session' ? 'Session note' : 'Exercise setup note'}</div>
            <p className="sheet-hint">{noteT.type === 'session' ? 'How did it go? Sleep, energy, anything to remember.' : 'Settings & cues that resurface every time this lift comes up — e.g. “Incline @ 30°,” “Cable pin 10.”'}</p>
            <textarea className="sheet-area" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Type a note…" autoFocus></textarea>
            <button className="btn btn-acc" onClick={saveNote}><span>SAVE NOTE</span></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FINISH OVERLAY ────────────────────────────────────────────
function FinishOverlay({ summary, onDone }) {
  return (
    <div className="finish">
      <div className="finish-in">
        <div className="finish-badge"><Icon name="check" size={40} stroke="#0C0B0A" sw={2.6} /></div>
        <div className="kicker" style={{ marginTop: 24 }}>Workout Logged</div>
        <h1 className="disp" style={{ fontSize: 40, margin: '4px 0 0' }}>{summary.name}</h1>
        <div className="finish-stats">
          <div className="finish-stat"><div className="v disp">{fmtK(summary.volume)}</div><div className="kicker">Volume (lbs)</div></div>
          <div className="finish-stat"><div className="v disp">{summary.hardSets}</div><div className="kicker">Hard Sets</div></div>
          <div className="finish-stat"><div className="v disp">{summary.timer}</div><div className="kicker">Duration</div></div>
        </div>
        <p className="finish-note">Progression logged. SWOLE/OS updated your targets for next session.</p>
        <button className="btn btn-acc" onClick={onDone}><span>DONE</span></button>
      </div>
    </div>
  );
}

// ── HISTORY ───────────────────────────────────────────────────
function History({ sessions }) {
  return (
    <div className="scr">
      <div className="scr-scroll">
        <div className="fg-topbar"><span className="disp" style={{ fontSize: 30 }}>History</span><div className="fg-chip">{sessions.length} LOGGED</div></div>
        <div className="fg-sec">
          {sessions.map((s, i) => (
            <div className="hist-card" key={i}>
              <div className="hist-top">
                <span className="hist-name disp">{s.name}</span>
                <span className="hist-when mono">{s.when}</span>
              </div>
              <div className="hist-stats">
                <span className="mono">{fmtK(s.volume)} lbs</span><span className="dot">·</span>
                <span className="mono">{s.hardSets} hard sets</span><span className="dot">·</span>
                <span className="mono">{s.exs} exercises</span>
              </div>
              {s.pr && <div className="hist-pr"><Icon name="trophy" size={13} stroke="#FF8A3D" /> {s.pr}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE ───────────────────────────────────────────────────
function Profile({ profile, stats }) {
  const GOAL_NAMES = { physique: 'Physique', strength: 'Strength', performance: 'Performance', fat_loss: 'Fat Loss', balanced: 'Balanced', build_muscle: 'Physique', get_stronger: 'Strength', hybrid: 'Performance' };
  const goalsList = (profile.goals && profile.goals.length) ? profile.goals.map(k => GOAL_NAMES[k] || k).join(' › ') : (GOAL_NAMES[profile.goal] || 'Balanced');
  const REP_NAMES = { higher: 'Higher reps', moderate: 'Moderate reps', lower: 'Lower reps', both: 'No preference' };
  const LVL_NAMES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
  const style = [REP_NAMES[profile.reps], LVL_NAMES[profile.level]].filter(Boolean).join(' · ') || '—';
  return (
    <div className="scr">
      <div className="scr-scroll">
        <div className="fg-topbar"><span className="disp" style={{ fontSize: 30 }}>Profile</span></div>
        <div className="fg-sec">
          <div className="prof-id">
            <div className="prof-av disp">{(profile.name[0] || 'A').toUpperCase()}</div>
            <div>
              <div className="disp" style={{ fontSize: 26 }}>{profile.name}</div>
              <div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>marcus@swoleos.app</div>
            </div>
          </div>

          <div className="fg-rule"><span className="kicker">System Spec</span><span className="ln"></span></div>
          <div className="fg-card">
            <div className="prof-row"><span className="prof-k">Goals</span><span className="prof-v">{goalsList}</span></div>
            <div className="prof-row"><span className="prof-k">Frequency</span><span className="prof-v">{profile.days} days / week</span></div>
            <div className="prof-row"><span className="prof-k">Training style</span><span className="prof-v">{style}</span></div>
            <div className="prof-row"><span className="prof-k">Weakness</span><span className="prof-v">{profile.weakest || '—'}</span></div>
            <div className="prof-row"><span className="prof-k">Priority muscles</span><span className="prof-v">{profile.muscles && profile.muscles.length ? profile.muscles.join(' · ') : 'Balanced'}</span></div>
            <div className="prof-row"><span className="prof-k">Lifetime volume</span><span className="prof-v">{fmtK(stats.volume * 12)} lbs</span></div>
          </div>

          <button className="prof-deepen">
            <div>
              <div className="disp" style={{ fontSize: 18 }}>Sharpen your intelligence</div>
              <div className="mono" style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 3 }}>Add age, maxes & training history for tighter targets</div>
            </div>
            <Icon name="arrow" size={18} stroke="#FF5A1E" />
          </button>

          <div className="prof-premium">
            <div className="prof-prem-glow"></div>
            <div className="kicker" style={{ color: 'var(--acc2)' }}>SWOLE/OS PRO</div>
            <div className="disp" style={{ fontSize: 24, margin: '6px 0 8px' }}>Unlock the full engine.</div>
            <div className="prof-prem-list">
              <span>· Prebuilt expert programs</span><span>· Advanced plateau analytics</span><span>· Video demos for every lift</span>
            </div>
            <button className="btn btn-acc" style={{ marginTop: 16 }}><span>GO PRO — $9/MO</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TabBar, Home, Logger, ExercisePicker, FinishOverlay, History, Profile });
