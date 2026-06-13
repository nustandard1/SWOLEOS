// FORGE prototype — Login, Signup, and the "calibrate your system" onboarding.
const { useState: useStateF } = React;

// ── Reusable field ────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="fg-field">
      <span className="fg-field-lbl">{label}</span>
      <input
        className="fg-field-in"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        autoCapitalize="none" autoCorrect="off"
      />
    </label>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────
function Login({ onLogin, onSwitch }) {
  const [email, setEmail] = useStateF('marcus@swoleos.app');
  const [pw, setPw] = useStateF('••••••••');
  return (
    <div className="scr auth">
      <div className="auth-watermark">S</div>
      <div className="auth-top">
        <LoadedBarIcon size={52} />
        <SlashWordmark size={30} />
      </div>

      <div className="auth-hero">
        <div className="kicker">Smart training log</div>
        <h1 className="disp auth-hl">The only training<br />log you'll ever<br />need.</h1>
      </div>

      <div className="auth-form">
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Password" value={pw} onChange={setPw} type="password" />
        <button className="btn btn-acc" onClick={onLogin}>
          <span>LOG IN</span><Icon name="arrow" size={20} stroke="#0C0B0A" />
        </button>
        <div className="auth-or"><span></span>OR<span></span></div>
        <button className="btn btn-ghost" onClick={onLogin}> Continue with Apple</button>
      </div>

      <div className="auth-foot">
        New to SWOLE/OS? <button className="link" onClick={onSwitch}>CREATE ACCOUNT</button>
      </div>
    </div>
  );
}

// ── SIGNUP ────────────────────────────────────────────────────
function Signup({ onSignup, onSwitch }) {
  const [email, setEmail] = useStateF('');
  const [pw, setPw] = useStateF('');
  return (
    <div className="scr auth">
      <div className="auth-watermark">S</div>
      <div className="auth-top">
        <LoadedBarIcon size={52} />
        <SlashWordmark size={30} />
      </div>

      <div className="auth-hero">
        <div className="kicker">Create account</div>
        <h1 className="disp auth-hl">Build a system<br />that trains you<br />back.</h1>
      </div>

      <div className="auth-form">
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com" />
        <Field label="Password" value={pw} onChange={setPw} type="password" placeholder="8+ characters" />
        <button className="btn btn-acc" onClick={onSignup}>
          <span>CREATE ACCOUNT</span><Icon name="arrow" size={20} stroke="#0C0B0A" />
        </button>
        <p className="auth-fine">By continuing you agree to the Terms & Privacy Policy.</p>
      </div>

      <div className="auth-foot">
        Already have an account? <button className="link" onClick={onSwitch}>LOG IN</button>
      </div>
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────
const GOALS = [
  { k: 'physique', t: 'Physique', d: 'Muscle growth & size', i: 'bolt' },
  { k: 'strength', t: 'Strength', d: 'Move heavier weight', i: 'trophy' },
  { k: 'performance', t: 'Performance', d: 'Athleticism & conditioning', i: 'flame' },
  { k: 'fat_loss', t: 'Fat Loss', d: 'Lean out, keep muscle', i: 'target' },
  { k: 'balanced', t: 'Balanced', d: 'A bit of everything', i: 'home' },
];
const MUSCLES = ['Chest', 'Back', 'Delts', 'Arms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
const REP_PREFS = [
  { k: 'higher', t: 'Higher reps', d: '12–20+ reps' },
  { k: 'moderate', t: 'Moderate reps', d: '8–12 reps' },
  { k: 'lower', t: 'Lower reps', d: '3–7 reps' },
];
const LEVELS = [
  { k: 'beginner', t: 'Beginner', d: 'New — under ~1 year' },
  { k: 'intermediate', t: 'Intermediate', d: '1–3 years training' },
  { k: 'advanced', t: 'Advanced', d: '3+ years, dialed in' },
];
const ARCHETYPES = [
  { k: 'compound', t: 'I love heavy compound lifts' },
  { k: 'physique', t: 'I care mostly about physique' },
  { k: 'both', t: 'Both, equally' },
];
const WEAK_PARTS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'All of it'];
const LIMITERS = ['Having no plan', 'Consistency', 'Motivation', 'Recovery / injuries', 'Nutrition', 'Not sure / none'];

// Act 1 — value hook (honest about what the app is)
const HOOK_BEATS = [
  { ic: 'plus', k: 'Log it in seconds', d: 'Log your own training and keep it all in one place, with built-in intelligence to help guide progression. Or build your program from a template.' },
  { ic: 'bolt', k: 'Train with intelligence', d: 'SWOLE/OS analyses your previous sessions and gives you progression targets — guiding progressive overload rep by rep, session by session.' },
  { ic: 'history', k: 'See the bigger picture', d: 'SWOLE/OS Intelligence reveals where you\'re growing and where you\'re stalling, with weekly & monthly breakdowns. Or follow expert programs with video demos on Pro.' },
];

function HookIntro({ onStart, onSkip }) {
  const [i, setI] = useStateF(0);
  const last = i === HOOK_BEATS.length - 1;
  const b = HOOK_BEATS[i];
  return (
    <div className="scr ob">
      <div className="hook-top">
        <SlashWordmark size={20} />
        <button className="hook-skip" onClick={onSkip}>SKIP</button>
      </div>
      <div className="scr-scroll hook-body">
        <div className="hook-ic"><Icon name={b.ic} size={30} stroke="#FF5A1E" sw={2.2} /></div>
        <div className="kicker" style={{ color: 'var(--acc2)' }}>{`0${i + 1} / 0${HOOK_BEATS.length}`}</div>
        <h1 className="disp hook-h">{b.k}</h1>
        <p className="ob-sub" style={{ maxWidth: 320 }}>{b.d}</p>
      </div>
      <div className="hook-foot">
        <div className="hook-dots">
          {HOOK_BEATS.map((_, x) => <button key={x} className={'hook-dot' + (x === i ? ' on' : '')} onClick={() => setI(x)}></button>)}
        </div>
        <button className="btn btn-acc" onClick={() => last ? onStart() : setI(i + 1)}>
          <span>{last ? 'CALIBRATE MY SYSTEM' : 'NEXT'}</span><Icon name="arrow" size={20} stroke="#0C0B0A" />
        </button>
      </div>
    </div>
  );
}

function Onboarding({ onComplete }) {
  const [phase, setPhase] = useStateF('hook'); // hook | calibrate | boot | payoff
  const [step, setStep] = useStateF(0);
  const [name, setName] = useStateF('');
  const [ranked, setRanked] = useStateF([]); // ordered goal keys
  const [days, setDays] = useStateF(4);
  const [reps, setReps] = useStateF(null);
  const [level, setLevel] = useStateF(null);
  const [archetype, setArchetype] = useStateF(null);
  const [weakest, setWeakest] = useStateF(null);
  const [muscles, setMuscles] = useStateF([]);
  const [limiters, setLimiters] = useStateF([]);
  const TOTAL = 8;

  const rankOf = (k) => { const i = ranked.indexOf(k); return i < 0 ? null : i + 1; };
  const toggleGoal = (k) => setRanked(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const toggleMuscle = (m) => setMuscles(prev => prev.includes(m) ? prev.filter(x => x !== m) : (prev.length < 3 ? [...prev, m] : prev));
  const toggleLimiter = (m) => setLimiters(prev => prev.includes(m) ? prev.filter(x => x !== m) : (prev.length < 3 ? [...prev, m] : prev));

  const canNext = [name.trim().length > 0, ranked.length > 0, days > 0, !!reps && !!level, !!archetype && !!weakest, true, true, true][step];

  function next() { if (step < TOTAL - 1) setStep(step + 1); }
  function calibrate() {
    setPhase('boot');
    setTimeout(() => setPhase('payoff'), 2100);
  }
  function done(entry) {
    onComplete({ name: name.trim() || 'Athlete', goals: ranked, goal: ranked[0] || 'balanced', days, reps, level, archetype, weakest, muscles, limiters, entry });
  }

  const topGoalName = (GOALS.find(g => g.k === ranked[0]) || {}).t;

  if (phase === 'hook') return <HookIntro onStart={() => setPhase('calibrate')} onSkip={() => setPhase('calibrate')} />;

  if (phase === 'boot') return (
    <div className="scr ob">
      <div className="ob-pane ob-boot">
        <LoadedBarIcon size={72} />
        <div className="ob-boot-bar"><div className="ob-boot-fill"></div></div>
        <div className="kicker ob-boot-txt">Calibrating progression engine…</div>
      </div>
    </div>
  );

  if (phase === 'payoff') return (
    <div className="scr ob">
      <div className="scr-scroll ob-body" style={{ paddingTop: 40 }}>
        <div className="pay-badge"><Icon name="check" size={30} stroke="#0C0B0A" sw={2.6} /></div>
        <div className="kicker" style={{ marginTop: 20, color: 'var(--acc2)' }}>System calibrated</div>
        <h1 className="disp ob-h">You're set,<br />{name.trim() || 'Athlete'}.</h1>
        <p className="ob-sub">SWOLE/OS will help guide you toward your goals and grow along with you — with progression targets tuned to your level. How do you want to start?</p>
        <div className="pay-paths">
          <button className="pay-path primary" onClick={() => done('log')}>
            <div className="pay-path-txt"><div className="pay-path-t disp">Start logging now</div><div className="pay-path-d">Jump straight in — log your first session</div></div>
            <Icon name="arrow" size={20} stroke="#0C0B0A" />
          </button>
          <button className="pay-path" onClick={() => done('template')}>
            <div className="pay-path-txt"><div className="pay-path-t disp">Build from a template</div><div className="pay-path-d">Set up a split — sessions populate as you go</div></div>
            <Icon name="arrow" size={18} stroke="#8C8273" />
          </button>
          <button className="pay-path pro" onClick={() => done('programs')}>
            <div className="pay-path-txt"><div className="pay-path-t disp">Explore expert programs <span className="pay-pro">PRO</span></div><div className="pay-path-d">Pro plans with video demos for every lift</div></div>
            <Icon name="arrow" size={18} stroke="#FF8A3D" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="scr ob">
      <div className="ob-head">
        {step > 0 ? (
          <button className="ob-back" onClick={() => setStep(step - 1)}><Icon name="chevL" size={20} stroke="#8C8273" /></button>
        ) : <button className="ob-back" onClick={() => setPhase('hook')}><Icon name="chevL" size={20} stroke="#8C8273" /></button>}
        <div className="ob-prog">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} className={'ob-prog-seg' + (i <= step ? ' on' : '')}></div>
          ))}
        </div>
        <span className="ob-step mono">{String(step + 1).padStart(2, '0')}/{TOTAL}</span>
      </div>

      <div className="scr-scroll ob-body">
        {step === 0 && (
          <div className="ob-pane">
            <LoadedBarIcon size={64} />
            <div className="kicker" style={{ marginTop: 22 }}>Initialize</div>
            <h1 className="disp ob-h">Forge your<br />system.</h1>
            <p className="ob-sub">A few quick questions tune how the intelligence guides you. First — what should we call you?</p>
            <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Marcus" />
          </div>
        )}

        {step === 1 && (
          <div className="ob-pane">
            <div className="kicker">Objective</div>
            <h1 className="disp ob-h">What matters<br />most?</h1>
            <p className="ob-sub">Tap to rank in order of importance — or just pick one. This shapes how SWOLE/OS weights your training.</p>
            <div className="ob-goals">
              {GOALS.map(g => {
                const r = rankOf(g.k);
                return (
                  <button key={g.k} className={'ob-goal' + (r ? ' on' : '')} onClick={() => toggleGoal(g.k)}>
                    <div className="ob-goal-ic"><Icon name={g.i} size={20} stroke={r ? '#FF5A1E' : '#8C8273'} /></div>
                    <div className="ob-goal-txt">
                      <div className="ob-goal-t disp">{g.t}</div>
                      <div className="ob-goal-d">{g.d}</div>
                    </div>
                    <div className={'ob-rank' + (r ? ' on' : '')}>{r || ''}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ob-pane">
            <div className="kicker">Frequency</div>
            <h1 className="disp ob-h">How many days<br />per week?</h1>
            <div className="ob-dial">
              <button className="ob-dial-btn" onClick={() => setDays(Math.max(2, days - 1))}>−</button>
              <div className="ob-dial-num">
                <span className="disp">{days}</span>
                <span className="kicker">days / week</span>
              </div>
              <button className="ob-dial-btn" onClick={() => setDays(Math.min(7, days + 1))}>+</button>
            </div>
            <div className="ob-dial-track">
              {[2, 3, 4, 5, 6, 7].map(d => (
                <button key={d} className={'ob-dial-pip' + (d <= days ? ' on' : '')} onClick={() => setDays(d)}></button>
              ))}
            </div>
            <p className="ob-sub" style={{ textAlign: 'center' }}>
              {days <= 3 ? 'Full-body & upper/lower splits work best here.' : days <= 5 ? 'A great range for a push / pull / legs rhythm.' : 'High volume — SWOLE/OS will watch fatigue closely.'}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="ob-pane">
            <div className="kicker">System Calibration</div>
            <h1 className="disp ob-h">Who you are<br />as a lifter.</h1>
            <p className="ob-sub" style={{ marginBottom: 16 }}>This is what powers SWOLE/OS Intelligence — the more it knows, the sharper your guidance.</p>
            <span className="ob-grp-lbl">What rep range do you tend to prefer training in?</span>
            <div className="ob-levels" style={{ marginBottom: 22 }}>
              {REP_PREFS.map(o => (
                <button key={o.k} className={'ob-level' + (reps === o.k ? ' on' : '')} onClick={() => setReps(o.k)}>
                  <div className="ob-level-txt"><div className="ob-level-t disp">{o.t}</div><div className="ob-goal-d">{o.d}</div></div>
                  <div className={'ob-radio' + (reps === o.k ? ' on' : '')}></div>
                </button>
              ))}
            </div>
            <span className="ob-grp-lbl">How experienced are you?</span>
            <div className="ob-levels">
              {LEVELS.map(o => (
                <button key={o.k} className={'ob-level' + (level === o.k ? ' on' : '')} onClick={() => setLevel(o.k)}>
                  <div className="ob-level-txt"><div className="ob-level-t disp">{o.t}</div><div className="ob-goal-d">{o.d}</div></div>
                  <div className={'ob-radio' + (level === o.k ? ' on' : '')}></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="ob-pane">
            <div className="kicker">System Calibration</div>
            <h1 className="disp ob-h">What drives<br />you?</h1>
            <span className="ob-grp-lbl" style={{ marginTop: 6 }}>Which statement best describes you?</span>
            <div className="ob-levels" style={{ marginBottom: 22 }}>
              {ARCHETYPES.map(o => (
                <button key={o.k} className={'ob-level' + (archetype === o.k ? ' on' : '')} onClick={() => setArchetype(o.k)}>
                  <div className="ob-level-txt"><div className="ob-level-t disp" style={{ fontSize: 16 }}>{o.t}</div></div>
                  <div className={'ob-radio' + (archetype === o.k ? ' on' : '')}></div>
                </button>
              ))}
            </div>
            <span className="ob-grp-lbl">What's your weakest body part?</span>
            <div className="ob-muscles">
              {WEAK_PARTS.map(m => (
                <button key={m} className={'ob-chip' + (weakest === m ? ' on' : '')} onClick={() => setWeakest(m)}>{m}</button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="ob-pane">
            <div className="kicker">Focus</div>
            <h1 className="disp ob-h">Any muscles to<br />prioritize?</h1>
            <p className="ob-sub">Choose up to 3 — or stay balanced. SWOLE/OS will nudge a little extra volume their way.</p>
            <div className="ob-muscles">
              <button className={'ob-chip' + (muscles.length === 0 ? ' on' : '')} onClick={() => setMuscles([])}>Balanced</button>
              {MUSCLES.map(m => (
                <button key={m} className={'ob-chip' + (muscles.includes(m) ? ' on' : '')} onClick={() => toggleMuscle(m)}>{m}</button>
              ))}
            </div>
            <div className="ob-count mono">{muscles.length ? muscles.length + '/3 selected' : 'Balanced'}</div>
          </div>
        )}

        {step === 6 && (
          <div className="ob-pane">
            <div className="kicker">Friction</div>
            <h1 className="disp ob-h">What holds<br />you back?</h1>
            <p className="ob-sub">Pick up to 3. SWOLE/OS Intelligence will watch for these and factor them into your guidance.</p>
            <div className="ob-muscles">
              {LIMITERS.map(m => (
                <button key={m} className={'ob-chip' + (limiters.includes(m) ? ' on' : '')} onClick={() => toggleLimiter(m)}>{m}</button>
              ))}
            </div>
            <div className="ob-count mono">{limiters.length}/3 selected</div>
          </div>
        )}

        {step === 7 && (
          <div className="ob-pane">
            <div className="kicker">Confirm</div>
            <h1 className="disp ob-h">System spec.</h1>
            <div className="ob-spec">
              <div className="ob-spec-row"><span className="ob-spec-k">Operator</span><span className="ob-spec-v">{name.trim() || 'Athlete'}</span></div>
              <div className="ob-spec-row"><span className="ob-spec-k">Goals</span><span className="ob-spec-v">{ranked.length ? ranked.map(k => (GOALS.find(g => g.k === k) || {}).t).join(' › ') : 'Balanced'}</span></div>
              <div className="ob-spec-row"><span className="ob-spec-k">Frequency</span><span className="ob-spec-v">{days} days / week</span></div>
              <div className="ob-spec-row"><span className="ob-spec-k">Style</span><span className="ob-spec-v">{(REP_PREFS.find(o => o.k === reps) || {}).t} · {(LEVELS.find(o => o.k === level) || {}).t}</span></div>
              <div className="ob-spec-row"><span className="ob-spec-k">Weakness</span><span className="ob-spec-v">{weakest || '—'}</span></div>
              <div className="ob-spec-row"><span className="ob-spec-k">Priority</span><span className="ob-spec-v">{muscles.length ? muscles.join(' · ') : 'Balanced'}</span></div>
            </div>
            <p className="ob-sub">Lock it in and SWOLE/OS tunes your progression engine. You can recalibrate anytime in your profile.</p>
          </div>
        )}
      </div>

      <div className="ob-foot">
        {step < TOTAL - 1 ? (
          <button className={'btn btn-acc' + (canNext ? '' : ' disabled')} disabled={!canNext} onClick={next}>
            <span>CONTINUE</span><Icon name="arrow" size={20} stroke="#0C0B0A" />
          </button>
        ) : (
          <button className="btn btn-acc" onClick={calibrate}>
            <span>CALIBRATE SYSTEM</span><Icon name="arrow" size={20} stroke="#0C0B0A" />
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Login, Signup, Onboarding, HookIntro, Field });
