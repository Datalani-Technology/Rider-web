import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

export default function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#030303] flex flex-col items-center justify-center px-6 py-12">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <img src="/dash-logo.png" alt="DASH" className="h-10 w-auto object-contain" />
        <div className="h-6 w-px bg-gray-700" />
        <span className="text-gray-500 text-sm font-medium">Admin Console</span>
      </div>

      <div className="w-full max-w-sm">
        {sent ? (
          /* ── Success state ── */
          <div className="text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <svg className="w-9 h-9 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white text-xl font-bold">Check your email</h2>
              <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                We sent a password reset link to<br />
                <span className="text-white font-medium">{email}</span>
              </p>
              <p className="text-gray-600 text-xs mt-3">
                Didn't receive it? Check your spam folder or try again.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => setSent(false)}
                className="w-full py-3 rounded-xl border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Try a different email
              </button>
              <button
                onClick={onBack}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #FF3B00 0%, #CC2F00 100%)' }}
              >
                Back to Sign In
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <div className="mb-8">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-500 hover:text-white text-sm transition-colors mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to sign in
              </button>
              <h2 className="text-white text-2xl font-bold">Reset your password</h2>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Enter the email address linked to your admin account and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5 uppercase tracking-wider">Admin email</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@dash.co.na"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-all"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all duration-200 relative overflow-hidden group disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #FF3B00 0%, #CC2F00 100%)' }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {loading ? 'Sending reset link…' : 'Send Reset Link'}
                </span>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </form>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-gray-700 text-xs mt-10">
          Developed by <span className="text-gray-600">Datalani Technology CC</span>
        </p>
      </div>
    </div>
  );
}
