import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Zap, AlertCircle, Eye, EyeOff, CheckCircle2, Lock, Mail, ChevronRight, AlertTriangle, ShieldCheck, Cpu, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [subEndedNotice, setSubEndedNotice] = useState(() => {
    try {
      const ended = localStorage.getItem("subscription_ended_logout");
      if (ended === "true") {
        localStorage.removeItem("subscription_ended_logout");
        return "Your subscription has ended or expired. Please sign in to choose and purchase another subscription.";
      }
    } catch (e) {
      console.error(e);
    }
    return "";
  });
  
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus();
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.getModifierState) {
        setCapsLockActive(e.getModifierState('CapsLock'));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.getModifierState) {
        setCapsLockActive(e.getModifierState('CapsLock'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLogin]);

  const validateEmail = (emailStr: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(emailStr).toLowerCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setError('');
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      emailInputRef.current?.focus();
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (signInErr: any) {
          const code = signInErr.code || '';
          const msg = signInErr.message || '';
          if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || msg.includes('auth/invalid-credential')) {
            // Suggest creating an account or just show error based on user intent
            setError('Incorrect email or password. Please try again.');
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
        setError('Email/Password sign-in is not enabled. Please contact support.');
      } else if (errorCode === 'auth/network-request-failed' || errorMessage.includes('network-request-failed')) {
        setError("Network connection failed. If you are inside the preview iframe, this is blocked by third-party cookie restrictions or browser shields (e.g. Brave Shields / AdBlockers). Please click 'Open in New Tab' in the top-right of the preview pane or temporarily disable your adblocker/shields.");
      } else if (errorCode === 'auth/too-many-requests') {
        setError('Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.');
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
        setError('Google Sign-In is not enabled. Please contact support.');
      } else if (errorCode === 'auth/network-request-failed' || errorMessage.includes('network-request-failed')) {
        setError("Google SSO failed: Network request blocked. This usually happens in the preview iframe. Please click 'Open in New Tab' in the top-right corner, or check if Brave Shields or an adblocker is blocking Google authentication endpoints.");
      } else if (errorCode === 'auth/cancelled-popup-request' || errorMessage.includes('cancelled-popup-request') || errorCode === 'auth/popup-closed-by-user') {
        // Silently ignore popup closed
      } else {
        setError(err.message || 'An error occurred during Google sign in.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans overflow-hidden text-slate-900">
      {/* Left Column: Visual Brand and Features Showcase - Visible on Desktop */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-slate-950 flex-col justify-between p-12 overflow-hidden border-r border-slate-800">
        
        {/* Subtle Engineering/Circuit Background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
        <div className="absolute inset-0 opacity-[0.1] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(99, 102, 241, 0.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.2), transparent 40%)',
        }} />
        
        {/* Circuit traces decoration */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,100 L150,100 L180,130 L400,130 L430,100 L1000,100" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5,5" />
          <path d="M250,0 L250,80 L280,110 L280,500" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="150" cy="100" r="4" fill="#fff" />
          <circle cx="430" cy="100" r="4" fill="#fff" />
          <circle cx="280" cy="110" r="4" fill="#fff" />
        </svg>
        
        {/* Top Branding Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-lg shadow-indigo-900/40 border border-indigo-400/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-white tracking-tight text-2xl flex items-center gap-2">
              ElectricalPH
            </span>
            <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest -mt-0.5 opacity-80">
              Professional Electrical Engineering Design Platform
            </p>
          </div>
        </motion.div>

        {/* Core Value Proposition */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 my-auto max-w-lg space-y-10"
        >
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm shadow-inner shadow-white/5">
              <ShieldCheck className="w-3.5 h-3.5" />
              PEC 2017 & IEEE Compliant
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight">
              Precision Engineering, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-sky-400">Streamlined.</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md font-medium">
              Design, calculate, and audit industrial and residential systems with high-fidelity analytics, automated panel scheduling, and professional report generation.
            </p>
          </div>

          {/* Quick Features List */}
          <div className="space-y-5">
            <div className="flex gap-4 group">
              <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-indigo-900/50 group-hover:border-indigo-500/50 group-hover:text-indigo-400 transition-all duration-300 shadow-sm shrink-0 mt-1">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-200">Smart Load Schedules & Automations</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">Auto-calculate wire ampacities, conduit fill sizes, voltage drops, and optimal protective device ratings.</p>
              </div>
            </div>
            <div className="flex gap-4 group">
              <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-indigo-900/50 group-hover:border-indigo-500/50 group-hover:text-indigo-400 transition-all duration-300 shadow-sm shrink-0 mt-1">
                <Activity className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-200">Short Circuit & Fault Analysis</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">Dynamic point-to-point fault calculations using precise impedance vectors and standard material parameters.</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Footer info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="relative z-10 text-xs text-slate-500 font-medium tracking-wide flex justify-between"
        >
          <span>&copy; {new Date().getFullYear()} ElectricalPH. All Rights Reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
          </div>
        </motion.div>
      </div>

      {/* Right Column: High-fidelity Login Panel Container */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 relative bg-white">
        
        {/* Mobile Branding */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-lg shadow-md">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight text-lg">ElectricalPH</span>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-[380px]"
        >
          <div className="space-y-2 mb-8 mt-8 lg:mt-0">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              {isLogin ? 'Enter your credentials to access your workspace.' : 'Enter your details to start professional engineering design.'}
            </p>
          </div>

          {isIframe && (
            <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-indigo-500" />
              <div className="text-xs space-y-1.5 text-indigo-900">
                <p className="font-bold">Preview Environment Notice</p>
                <p className="leading-relaxed opacity-90">
                  Authentication may be blocked by iframe restrictions. If you face a network error, click <strong className="font-extrabold">"Open in New Tab"</strong> (top-right) to authenticate normally.
                </p>
              </div>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {subEndedNotice && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-900 overflow-hidden"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-xs font-medium leading-relaxed">{subEndedNotice}</p>
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-900 overflow-hidden"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                <p className="text-xs font-medium leading-relaxed">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  className={`block w-full pl-11 pr-3.5 py-3 bg-white border ${error && !validateEmail(email) && email.length > 0 ? 'border-red-300 ring-4 ring-red-100' : 'border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'} rounded-xl text-slate-900 placeholder-slate-400 font-medium text-sm transition-all shadow-sm`}
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                {isLogin && (
                  <button type="button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  className="block w-full pl-11 pr-11 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-medium text-sm transition-all shadow-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <AnimatePresence>
                {capsLockActive && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-[11px] font-bold text-amber-600 flex items-center gap-1.5 mt-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Caps Lock is ON
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {isLogin && (
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer transition-all"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer font-medium select-none">
                  Stay signed in for 30 days
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-wait transition-all overflow-hidden"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[11px] font-bold text-slate-400 tracking-wider">
              <span className="px-3 bg-white uppercase">or continue with</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleSignIn}
              type="button"
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-slate-200 rounded-xl shadow-sm bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 hover:text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-slate-600 font-medium">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors hover:underline"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>

          {/* Mobile Footer */}
          <div className="mt-12 lg:hidden text-center text-xs text-slate-500 space-y-2 font-medium">
            <div className="flex justify-center gap-4">
              <a href="#" className="hover:text-slate-800">Privacy Policy</a>
              <a href="#" className="hover:text-slate-800">Terms of Service</a>
              <a href="#" className="hover:text-slate-800">Support</a>
            </div>
            <p>&copy; {new Date().getFullYear()} ElectricalPH.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
