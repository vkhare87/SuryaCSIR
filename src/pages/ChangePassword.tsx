import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabaseClient';
import { ROLE_ROUTES } from '../constants/roleRoutes';

export default function ChangePassword() {
  const { user, clearMustChangePassword, role } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (!supabase || !user) {
      setError('Not connected to database.');
      return;
    }

    setIsLoading(true);

    // Step 1: verify current password by re-authenticating.
    // Skipped for first-time / magic-link users who have no current password.
    if (currentPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        setError('Current password is incorrect.');
        setIsLoading(false);
        return;
      }
    }

    // Step 2: clear must_change_password in DB BEFORE updating password.
    // This ensures onAuthStateChange (fired by updateUser) reads false from DB.
    await clearMustChangePassword();

    // Step 3: update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    // Step 4: navigate to role dashboard
    navigate(role ? ROLE_ROUTES[role] : '/');
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f5f4ed] overflow-hidden font-sans">

      {/* Left Panel */}
      <div className="flex-1 relative overflow-hidden bg-[#141413] p-12 flex flex-col justify-between">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#faf9f5]/5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border border-[#faf9f5]/10" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#c96442]/5 rounded-full translate-x-1/4 translate-y-1/4 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-6">
          <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase">
            Digital Sun Initiative
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4 py-20 lg:py-0">
          <div className="flex items-center gap-6">
            <h1 className="text-8xl lg:text-[10rem] font-[500] text-[#faf9f5] tracking-tight font-serif">SURYA</h1>
            <div className="text-[#d97757] animate-pulse">
              <Sun size={80} strokeWidth={3} />
            </div>
          </div>
          <p className="text-[#b0aea5] text-base max-w-md mt-4 leading-relaxed">
            Your account requires a password change before you can access the system.
            Choose a strong password you haven't used before.
          </p>
        </div>

        <div className="relative z-10 border-t border-[#faf9f5]/10 pt-8">
          <div className="text-[10px] font-semibold text-[#b0aea5] tracking-[0.4em] uppercase">
            CSIR-AMPRI — UNIFIED INSTITUTIONAL INTELLIGENCE
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="lg:w-[500px] bg-[#faf9f5] flex flex-col items-center justify-center p-8 lg:p-16 relative">
        <div className="w-full max-w-sm space-y-10">

          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-[#faf9f5] rounded-[16px] p-4 mb-6 shadow-[0px_0px_0px_1px_#f0eee6] flex items-center justify-center">
              <Lock size={36} className="text-[#c96442]" />
            </div>
            <h2 className="text-3xl font-[500] text-[#141413] tracking-tight mb-2 uppercase font-serif">
              Set New Password
            </h2>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-semibold tracking-[0.2em] text-[#87867f] uppercase">
                First Login — Password Change Required
              </span>
              <div className="h-1 w-24 bg-[#c96442] mt-2 rounded-full" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest">
                  Current Password
                </label>
                <span className="text-[10px] text-[#b0aea5] italic">
                  Leave blank if signing in for the first time
                </span>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Leave blank if first-time setup"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">
                New Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Min. 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">
                Confirm New Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#b53333] font-bold bg-[#f5e8e8] p-4 rounded-xl border border-[#e8c8c8]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-[#c96442] hover:bg-[#b5593b] text-[#faf9f5] rounded-[8px] font-semibold text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0px_0px_0px_1px_#c96442] transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {isLoading ? 'Updating...' : 'Set New Password'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
