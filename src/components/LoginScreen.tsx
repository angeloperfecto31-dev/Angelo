import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Zap, AlertCircle } from 'lucide-react';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (signInErr: any) {
          const code = signInErr.code || '';
          const msg = signInErr.message || '';
          if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || msg.includes('auth/invalid-credential')) {
            // Attempt to create the account instead
            try {
              await createUserWithEmailAndPassword(auth, email, password);
            } catch (createErr: any) {
              throw createErr;
            }
          } else {
            throw signInErr;
          }
        }
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      
      if (errorCode === 'auth/invalid-credential' || errorMessage.includes('auth/invalid-credential') || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found') {
        setError('Incorrect email or password.');
      } else if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('auth/email-already-in-use')) {
        setError('An account with this email already exists.');
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('auth/weak-password')) {
        setError('Password should be at least 6 characters.');
      } else if (errorCode === 'auth/operation-not-allowed' || errorMessage.includes('auth/operation-not-allowed')) {
        setError('Email/Password sign-in is not enabled. Please enable it in the Firebase Console under Authentication.');
      } else {
        setError(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      if (errorCode === 'auth/operation-not-allowed' || errorMessage.includes('auth/operation-not-allowed')) {
        setError('Google Sign-In is not enabled. Please enable it in the Firebase Console under Authentication.');
      } else {
        setError(err.message || 'An error occurred during Google sign in.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex font-sans overflow-hidden">
      {/* Left Column: Visual Brand and Features Showcase - Visible on Desktop */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 flex-col justify-between p-12 border-r border-slate-800/80 overflow-hidden">
        {/* Abstract Architectural Grid Background */}
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.15), transparent), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 20px 20px, 20px 20px'
        }} />
        
        {/* Top Branding Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2.5 bg-yellow-400 rounded-xl shadow-md shadow-yellow-400/10">
            <Zap className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <span className="font-extrabold text-white tracking-tight text-xl">
              ElectricalPH
            </span>
            <p className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest -mt-1">
              Engineering Cloud Platform
            </p>
          </div>
        </div>

        {/* Core Value Proposition & Mock Blueprint Accent */}
        <div className="relative z-10 my-auto max-w-md space-y-8">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              🇵🇭 Filipino Engineering Standard
            </span>
            <h1 className="text-4xl font-black text-white leading-tight tracking-tight uppercase">
              Professional Electrical Analysis Suite
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Design, calculate, and audit industrial and residential systems in strict compliance with the <strong className="text-slate-200">Philippine Electrical Code (PEC 2017)</strong> and modern regulatory standards.
            </p>
          </div>

          {/* Quick Features List */}
          <div className="space-y-4">
            <div className="flex gap-3.5">
              <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center text-indigo-300 text-[10px] font-bold">1</div>
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Smart Load Schedules</h4>
                <p className="text-slate-400 text-xs">Auto-calc wire ampacities, conduit sizes, and breaker ratings dynamically.</p>
              </div>
            </div>
            <div className="flex gap-3.5">
              <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center text-indigo-300 text-[10px] font-bold">2</div>
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Transient Short Circuit & Voltage Drop</h4>
                <p className="text-slate-400 text-xs">Point-to-point calculations utilizing standard copper/aluminum parameters.</p>
              </div>
            </div>
            <div className="flex gap-3.5">
              <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center text-indigo-300 text-[10px] font-bold">3</div>
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">High Fidelity Illumination & Daylight</h4>
                <p className="text-slate-400 text-xs">Dynamic lumens calculations, false-color render mappings, and LPD audits.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-[10px] text-slate-500 font-medium tracking-wide flex justify-between">
          <span>&copy; {new Date().getFullYear()} ElectricalPH Systems.</span>
          <span>In Compliance with PEC Parts 1 &amp; 2</span>
        </div>
      </div>

      {/* Right Column: High-fidelity Login Panel Container */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 bg-slate-950 relative">
        <div className="absolute top-8 left-8 lg:hidden flex items-center gap-3">
          <div className="p-2 bg-yellow-400 rounded-lg">
            <Zap className="w-4 h-4 text-slate-950" />
          </div>
          <span className="font-extrabold text-white tracking-tight">ElectricalPH</span>
        </div>

        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-sm text-slate-400 font-semibold">
              {isLogin ? 'Sign in to access secure blueprints & reports.' : 'Start computing in compliance with PEC standards today.'}
            </p>
          </div>

          <div className="bg-slate-900/40 p-6 sm:p-8 rounded-2xl border border-slate-800/60 shadow-2xl backdrop-blur-sm space-y-6">
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200 font-medium leading-relaxed">{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Professional Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3.5 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all shadow-inner"
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Secure Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3.5 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all shadow-inner"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-indigo-900/25 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Processing System...' : isLogin ? 'Authenticate Station' : 'Provision Station'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-slate-500 bg-transparent">
                <span className="px-3 bg-[#0d1222]">or run with</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full flex justify-center items-center gap-2.5 py-3 px-4 border border-slate-800 rounded-xl shadow-sm bg-slate-950/50 hover:bg-slate-950 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-all"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google SSO
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-slate-500 font-semibold">
              {isLogin ? "Don't have an engineering account? " : "Already registered for a portal key? "}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors underline decoration-indigo-400/20"
              >
                {isLogin ? 'Provision Workspace' : 'Sign In Now'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
