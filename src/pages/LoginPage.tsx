import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const SLIDES = [
  {
    accent: '#FF3B00',
    tag: 'Real-Time Intelligence',
    title: 'Complete\nvisibility.',
    subtitle: 'Every order, every driver, in real time.',
    body: "Watch deliveries move across Windhoek on a live map. Know exactly what's happening before your drivers do.",
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    accent: '#2980B9',
    tag: 'Driver Management',
    title: 'Approve drivers\ninstantly.',
    subtitle: 'Keep your fleet delivering.',
    body: 'Review documents, approve applications and grant starter credits — all in one click. Your drivers are on the road in minutes.',
    iconPath: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    accent: '#27AE60',
    tag: 'Revenue & Credits',
    title: 'Revenue tracked\nautomatically.',
    subtitle: 'N$ earned, credited and approved.',
    body: 'Every credit purchase goes through you. Approve wallet top-ups, set pricing, and watch the commission flow in.',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    accent: '#8E44AD',
    tag: 'Built for Namibia',
    title: 'Made for\nWindhoek.',
    subtitle: 'Fast, reliable, local delivery.',
    body: 'Purpose-built for the Namibian market. Pricing in N$, Windhoek geofencing, MTC eWallet support — everything local.',
    iconPath: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  },
];

const LOADING_MESSAGES = [
  'Verifying your credentials…',
  'Checking admin access…',
  'Loading your workspace…',
  'Getting you in…',
];

export default function LoginPage({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [slide, setSlide] = useState(0);
  const [visible, setVisible] = useState(true);

  // ── Security: 3-attempt lockout ──────────────────────────────────────────────
  const LOCKOUT_MS = 5 * 60 * 1000; // 5-minute lockout
  const MAX_ATTEMPTS = 3;
  const [attempts, setAttempts] = useState(() => {
    const stored = sessionStorage.getItem('dash_login_attempts');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lockCountdown, setLockCountdown] = useState(0);
  const isLocked = lockCountdown > 0;

  // Initialise or continue an existing lockout on mount
  useEffect(() => {
    const until = localStorage.getItem('dash_lockout_until');
    if (until) {
      const remaining = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
      if (remaining > 0) setLockCountdown(remaining);
      else { localStorage.removeItem('dash_lockout_until'); sessionStorage.removeItem('dash_login_attempts'); }
    }
  }, []);

  // Tick the countdown every second
  useEffect(() => {
    if (lockCountdown <= 0) return;
    const t = setTimeout(() => {
      setLockCountdown(c => {
        if (c <= 1) {
          localStorage.removeItem('dash_lockout_until');
          sessionStorage.removeItem('dash_login_attempts');
          setAttempts(0);
          setError('');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [lockCountdown]);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setVisible(true); }, 400);
    }, 4800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadingMsg(m => Math.min(m + 1, LOADING_MESSAGES.length - 1)), 1200);
    return () => clearInterval(t);
  }, [loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoadingMsg(0);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Success — clear attempt tracking
      sessionStorage.removeItem('dash_login_attempts');
      localStorage.removeItem('dash_lockout_until');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      sessionStorage.setItem('dash_login_attempts', String(newAttempts));

      if (newAttempts >= MAX_ATTEMPTS) {
        // Lock the account for 5 minutes
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem('dash_lockout_until', String(until));
        setLockCountdown(Math.ceil(LOCKOUT_MS / 1000));
        setError('');
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts;
        if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(code)) {
          setError(`Incorrect email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
        } else if (code === 'auth/network-request-failed') {
          setError('No internet connection. Check your network.');
        } else {
          setError(`Sign-in failed. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
        }
      }
      setLoading(false);
    }
  };

  const cur = SLIDES[slide];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes spinR { to { transform: rotate(-360deg); } }
        .login-input::placeholder { color: rgba(255,255,255,0.18); }
        .login-input:focus { border-color: #FF3B00 !important; box-shadow: 0 0 0 3px rgba(255,59,0,0.12) !important; outline: none; }
        .login-btn-active:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 12px 40px rgba(255,59,0,0.35) !important; }
      `}</style>

      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', background: '#08080b', overflow: 'hidden' }}>

        {/* ══════════════════════════════════════════
            LEFT — Full brand panel
        ══════════════════════════════════════════ */}
        <div
          className="hidden lg:flex"
          style={{
            width: '55%',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(150deg, #0e0e12 0%, #0a0a0d 50%, #0d0d11 100%)',
            borderRight: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Grid texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }} />

          {/* Accent ambient glow */}
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            width: 700, height: 700,
            top: '45%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: cur.accent,
            filter: 'blur(130px)',
            opacity: 0.055,
            transition: 'background 1.2s ease',
            borderRadius: '50%',
          }} />

          {/* Content — fills the full height */}
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%', padding: '52px 60px' }}>

            {/* ── TOP: Large DASH logo as hero centrepiece ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 52 }}>
              <img
                src="/dash-logo.png"
                alt="DASH"
                style={{ height: 72, width: 'auto', objectFit: 'contain', filter: 'brightness(1.1)', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.15)' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Admin Console
                </span>
              </div>
            </div>

            {/* ── MIDDLE: Slide content ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(18px)',
                transition: 'opacity 0.38s ease, transform 0.38s ease',
              }}>

                {/* Tag pill */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px', borderRadius: 999,
                  border: `1px solid ${cur.accent}40`,
                  background: `${cur.accent}14`,
                  marginBottom: 36,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cur.accent, boxShadow: `0 0 8px ${cur.accent}` }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: cur.accent }}>
                    {cur.tag}
                  </span>
                </div>

                {/* Icon */}
                <div style={{
                  width: 80, height: 80, borderRadius: 22, marginBottom: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${cur.accent}20, ${cur.accent}07)`,
                  border: `1px solid ${cur.accent}2e`,
                }}>
                  <svg width="38" height="38" fill="none" stroke={cur.accent} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={cur.iconPath} />
                  </svg>
                </div>

                {/* Big headline */}
                <h1 style={{
                  fontSize: 'clamp(48px, 4.8vw, 68px)',
                  fontWeight: 900,
                  color: '#fff',
                  lineHeight: 0.96,
                  letterSpacing: '-0.03em',
                  marginBottom: 18,
                  whiteSpace: 'pre-line',
                }}>
                  {cur.title}
                </h1>

                {/* Coloured subtitle */}
                <h2 style={{
                  fontSize: 'clamp(18px, 2vw, 24px)',
                  fontWeight: 700,
                  color: cur.accent,
                  lineHeight: 1.3,
                  marginBottom: 24,
                  transition: 'color 0.7s ease',
                }}>
                  {cur.subtitle}
                </h2>

                {/* Body */}
                <p style={{ fontSize: 15, lineHeight: 1.75, color: 'rgba(255,255,255,0.36)', maxWidth: 380 }}>
                  {cur.body}
                </p>
              </div>
            </div>

            {/* ── BOTTOM: Dots + brand ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 32 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setVisible(false); setTimeout(() => { setSlide(i); setVisible(true); }, 400); }}
                    style={{
                      height: 6, width: i === slide ? 28 : 6, borderRadius: 3,
                      background: i === slide ? cur.accent : 'rgba(255,255,255,0.14)',
                      border: 'none', cursor: 'pointer',
                      transition: 'all 0.35s ease',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', fontWeight: 500 }}>DASH</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.13)', marginTop: 3 }}>Windhoek, Namibia</div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            RIGHT — Login form panel
        ══════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '40px 32px',
          overflowY: 'auto',
        }}>

          {/* Loading overlay */}
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 30,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(8,8,11,0.92)', backdropFilter: 'blur(10px)',
            }}>
              <div style={{ position: 'relative', width: 52, height: 52, marginBottom: 24 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.06)' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid #FF3B00', borderTopColor: 'transparent', animation: 'spin 0.85s linear infinite' }} />
                <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '1px solid rgba(255,59,0,0.2)', borderBottomColor: 'transparent', animation: 'spinR 1.5s linear infinite' }} />
              </div>
              <p style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{LOADING_MESSAGES[loadingMsg]}</p>
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, marginTop: 6 }}>This usually takes a moment</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="animate-bounce" style={{ width: 6, height: 6, borderRadius: 3, background: '#FF3B00', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          <div style={{ width: '100%', maxWidth: 400 }}>

            {/* ── Logo — prominent centrepiece ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
              {/* Logo with glow */}
              <div style={{ position: 'relative', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  position: 'absolute',
                  width: 220, height: 80,
                  background: 'radial-gradient(ellipse, rgba(255,59,0,0.22) 0%, transparent 70%)',
                  pointerEvents: 'none',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                }} />
                <img
                  src="/dash-logo.png"
                  alt="DASH"
                  style={{ position: 'relative', height: 120, width: 'auto', objectFit: 'contain', filter: 'brightness(1.08)' }}
                />
              </div>
              {/* Thin divider */}
              <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 20 }} />
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, textAlign: 'center' }}>
                Welcome back
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.33)', fontSize: 14, textAlign: 'center' }}>
                Sign in to your DASH Admin Console
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 7 }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none', lineHeight: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@dash.co.na"
                    autoComplete="email"
                    required
                    disabled={loading}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      padding: '13px 16px 13px 44px',
                      color: '#fff', fontSize: 14,
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
                    Password
                  </label>
                  <button type="button" onClick={onForgotPassword}
                    style={{ fontSize: 12, color: '#FF3B00', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none', lineHeight: 0 }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      padding: '13px 48px 13px 44px',
                      color: '#fff', fontSize: 14,
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                    {showPassword ? (
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Lockout banner */}
              {isLocked && (
                <div style={{
                  background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)',
                  borderRadius: 12, padding: '14px 16px', textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                    <svg width="16" height="16" fill="none" stroke="#E74C3C" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span style={{ color: '#E74C3C', fontWeight: 700, fontSize: 14 }}>Account Temporarily Locked</span>
                  </div>
                  <p style={{ color: 'rgba(231,76,60,0.8)', fontSize: 13, margin: '0 0 10px' }}>
                    3 failed attempts. Try again in:
                  </p>
                  <div style={{
                    fontSize: 28, fontWeight: 900, color: '#E74C3C', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {String(Math.floor(lockCountdown / 60)).padStart(2, '0')}:{String(lockCountdown % 60).padStart(2, '0')}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 8 }}>
                    Contact support if you believe this is an error
                  </p>
                </div>
              )}

              {/* Error */}
              {!isLocked && error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.22)',
                  borderRadius: 12, padding: '11px 14px',
                }}>
                  <svg style={{ flexShrink: 0, marginTop: 1 }} width="15" height="15" fill="none" stroke="#E74C3C" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p style={{ color: '#E74C3C', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Attempt indicator dots */}
              {!isLocked && attempts > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i < attempts ? '#E74C3C' : 'rgba(255,255,255,0.12)',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 4 }}>
                    {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} left
                  </span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password || isLocked}
                className={(!loading && email && password && !isLocked) ? 'login-btn-active' : ''}
                style={{
                  width: '100%', marginTop: 4,
                  padding: '14px 24px', borderRadius: 12, border: 'none',
                  background: (!loading && email && password && !isLocked)
                    ? 'linear-gradient(135deg, #FF3B00 0%, #CC2F00 100%)'
                    : 'rgba(255,255,255,0.07)',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: (!loading && email && password && !isLocked) ? 'pointer' : 'not-allowed',
                  opacity: (!loading && email && password && !isLocked) ? 1 : 0.4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s ease',
                  boxShadow: (!loading && email && password && !isLocked) ? '0 6px 28px rgba(255,59,0,0.28)' : 'none',
                }}
              >
                {isLocked ? 'Account Locked' : loading ? 'Signing in…' : (
                  <>
                    Sign In to Console
                    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop: 32, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 12, margin: '0 0 5px' }}>
                Admin access only · Authorised personnel only
              </p>
              <p style={{ color: 'rgba(255,255,255,0.11)', fontSize: 11, margin: 0 }}>
                Developed by{' '}
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>Datalani Technology CC</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
