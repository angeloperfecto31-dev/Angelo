import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';

export function Auth() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/network-request-failed' || error.message?.includes('network-request-failed')) {
        alert("Authentication failed: Network request blocked.\n\nSince the application is running inside a sandbox/preview iframe, modern browsers restrict third-party authentication context.\n\nPlease click the 'Open in New Tab' button in the top-right of the preview pane to sign in properly.");
      } else if (error.code === 'auth/cancelled-popup-request' || error.message?.includes('cancelled-popup-request')) {
         alert("Authentication failed: Popup was cancelled or blocked.\n\nIf you did not close the window manually, your browser might be blocking popups from this preview iframe. Please click the 'Open in New Tab' button in the top-right of the preview pane to authenticate securely.");
      } else {
        alert('Login failed: ' + error.message);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Logout error:', error);
    }
  };

  if (user) {
    const initial = user.displayName ? user.displayName.charAt(0).toUpperCase() : (user.email?.charAt(0).toUpperCase() || '?');
    return (
      <div className="w-full flex flex-col gap-3 p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 w-full overflow-hidden">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-md ring-2 ring-indigo-500/20 shrink-0">
            {user.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              initial
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-bold text-slate-200 truncate">
              {user.displayName || 'Authorized User'}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 truncate mt-0.5">
              {user.email}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-rose-500/20 border border-slate-700/50 hover:border-rose-500/30 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      className="w-full px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/80 hover:border-slate-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 backdrop-blur-sm"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in / Sign up
    </button>
  );
}
