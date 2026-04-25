import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Sun, User, Lock, ArrowRight, Mail } from 'lucide-react';
import { ROLE_ROUTES } from '../constants/roleRoutes';

const CSIR_STATS = [
  { label: 'National Labs', target: 38 },
  { label: 'Scientists', target: 4700, suffix: '+' },
  { label: 'Years of R&D', target: 78 },
  { label: 'Patents Filed', target: 4800, suffix: '+' },
];

const ACHIEVEMENTS = [
  'First Indian institute to develop anti-malarial drugs — 1947',
  'CSIR-NAL built India\'s first civilian aircraft, Saras',
  'CSIR-CFTRI: world-class food science safeguarding nutrition since 1950',
  'Open Source Drug Discovery — crowdsourced TB & malaria research',
  'Materials & alloys powering India\'s space & defense programs',
  '38 national laboratories spanning every scientific discipline',
];

function useCountUp(target: number, duration = 1500, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, active]);
  return count;
}

function StatCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [active, setActive] = useState(false);
  useEffect(() => { const t = setTimeout(() => setActive(true), 300); return () => clearTimeout(t); }, []);
  const count = useCountUp(target, 1400, active);
  return <span>{count.toLocaleString()}{suffix}</span>;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerVisible(false);
      setTimeout(() => {
        setTickerIndex(i => (i + 1) % ACHIEVEMENTS.length);
        setTickerVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Navigate to role-specific dashboard once auth and role are both resolved
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(ROLE_ROUTES[role]);
    }
  }, [isAuthenticated, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { success, error: loginError, otpSent } = await login(email, password);
      if (otpSent) {
        setMagicLinkSent(true);
      } else if (!success) {
        setError(loginError ?? 'Invalid credentials. Please try again.');
      }
      // On success: do NOT navigate here. The useEffect above handles navigation
      // once AuthContext sets role asynchronously after onAuthStateChange fires.
    } catch (err) {
      setError('Connection error. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f5f4ed] overflow-hidden font-sans">

      {/* Left Panel - Institutional Mural */}
      <div className="flex-1 relative overflow-hidden bg-[#141413] p-12 flex flex-col justify-between">
        {/* Decor: Circles */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#faf9f5]/5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border border-[#faf9f5]/10" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#c96442]/5 rounded-full translate-x-1/4 translate-y-1/4 pointer-events-none" />

        {/* Top Branding Section */}
        <div className="flex items-start gap-6 relative z-10">
          <div className="bg-[#faf9f5] p-3 rounded-xl flex flex-col items-center gap-2 w-28 scale-90 lg:scale-100">
            <div className="w-12 h-12 text-[#c96442]">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.35 19.43,11.03L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.32 14.87,5.07L14.49,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.51,2.42L9.13,5.07C8.53,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11.03C4.53,11.35 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.53,18.68 9.13,18.93L9.51,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.49,21.58L14.87,18.93C15.47,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" /></svg>
            </div>
            <div className="text-[8px] font-semibold leading-tight text-center text-[#4d4c48] uppercase">Council of Scientific & Industrial Research</div>
          </div>

          <div className="bg-[#faf9f5] p-3 rounded-xl flex flex-col items-center gap-2 w-28 scale-90 lg:scale-100">
             <div className="w-12 h-12 text-[#c96442]">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" /></svg>
             </div>
             <div className="text-[8px] font-semibold leading-tight text-center text-[#4d4c48] uppercase">Advanced Materials & Processes Research Institute</div>
          </div>

          <div className="ml-4 pt-2 hidden md:block">
            <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase">Digital Sun Initiative</div>
            <div className="text-[10px] font-medium text-[#b0aea5] tracking-wider">CSIR-AMPRI BHOPAL</div>
          </div>
        </div>

        {/* Center SURYA Logo Section */}
        <div className="relative z-10 flex flex-col gap-4 py-20 lg:py-0">
          <div className="flex items-center gap-6">
            <h1 className="text-8xl lg:text-[10rem] font-[500] text-[#faf9f5] tracking-tight font-serif">SURYA</h1>
            <div className="text-[#d97757] animate-pulse">
               <Sun size={80} strokeWidth={3} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mt-8 max-w-2xl">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0">S</div>
              <div>
                <div className="text-xs font-semibold text-[#faf9f5] uppercase tracking-wider">Scientific Research & Synergy</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5">The core energy source of R&D innovation.</div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0">U</div>
              <div>
                <div className="text-xs font-semibold text-[#faf9f5] uppercase tracking-wider">Unified Human Capital</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5">Centralized platform illuminating institutional talent.</div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0">R</div>
              <div>
                <div className="text-xs font-semibold text-[#faf9f5] uppercase tracking-wider">Ray of Growth & Outreach</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5">Extending influence through proactive commercialization.</div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0">Y</div>
              <div>
                <div className="text-xs font-semibold text-[#faf9f5] uppercase tracking-wider">Yardstick for Excellence</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5">Fair, illuminating performance and appraisal system.</div>
              </div>
            </div>
            <div className="flex gap-4 col-span-full">
              <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0">A</div>
              <div>
                <div className="text-xs font-semibold text-[#faf9f5] uppercase tracking-wider">All-in-one Agile Platform</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5">An overarching ecosystem connecting all institute functions.</div>
              </div>
            </div>
          </div>

          {/* Animated CSIR stats */}
          <div className="grid grid-cols-4 gap-6 mt-10 max-w-2xl">
            {CSIR_STATS.map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-[600] text-[#d97757] font-serif tabular-nums">
                  <StatCounter target={stat.target} suffix={stat.suffix} />
                </div>
                <div className="text-[10px] text-[#b0aea5] uppercase tracking-widest mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Tagline Section */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-t border-[#faf9f5]/10 pt-8 mt-12 lg:mt-0">
          <div className="flex items-start gap-4">
             <div className="h-10 w-1 bg-[#c96442]" />
             <div>
               <div className="text-2xl font-[500] text-[#d97757] leading-tight font-serif">सूर्य</div>
               <div className="text-[10px] font-semibold text-[#b0aea5] tracking-[0.4em] uppercase">The Digital Sun</div>
             </div>
          </div>
          {/* Achievement ticker */}
          <div className="max-w-xs">
            <div
              className="text-[10px] text-[#b0aea5] leading-relaxed italic transition-opacity duration-300"
              style={{ opacity: tickerVisible ? 1 : 0 }}
            >
              {ACHIEVEMENTS[tickerIndex]}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Controls */}
      <div className="lg:w-[500px] bg-[#faf9f5] flex flex-col items-center justify-center p-8 lg:p-16 relative">
        <div className="w-full max-w-sm space-y-12">

          {/* Header */}
          <div className="flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-[#faf9f5] rounded-[16px] p-4 mb-8 shadow-[0px_0px_0px_1px_#f0eee6] flex items-center justify-center">
                <div className="w-full h-full text-[#c96442]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" /></svg>
                </div>
             </div>
             <h2 className="text-4xl font-[500] text-[#141413] tracking-tight mb-2 uppercase font-serif">Access SURYA</h2>
             <div className="flex flex-col items-center">
                <span className="text-[10px] font-semibold tracking-[0.2em] text-[#87867f] uppercase">Authorized Executive Entry</span>
                <div className="h-1 w-24 bg-[#c96442] mt-2 rounded-full" />
             </div>
          </div>

          {magicLinkSent ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center text-[#16a34a]">
                  <Mail size={28} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#141413] mb-1">Check your inbox</p>
                  <p className="text-xs text-[#87867f] leading-relaxed">
                    A sign-in link has been sent to<br />
                    <span className="font-semibold text-[#141413]">{email}</span>.<br />
                    Click the link in the email to access SURYA.
                  </p>
                </div>
                <p className="text-[10px] text-[#b0aea5] leading-relaxed px-2">
                  Your account requires a one-time recovery. After signing in via the link,
                  contact your administrator to restore normal password access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setMagicLinkSent(false); setError(''); }}
                className="w-full py-3 border border-[#e5e3dc] rounded-[8px] text-xs font-semibold text-[#87867f] uppercase tracking-widest hover:bg-[#f5f4ed] transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : (
          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                    <User size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                    placeholder="e.g. admin@ampri.res.in"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">Security Protocol</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#b53333] font-bold bg-[#f5e8e8] p-4 rounded-xl border border-[#e8c8c8] animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-[#c96442] hover:bg-[#b5593b] text-[#faf9f5] rounded-[8px] font-semibold text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0px_0px_0px_1px_#c96442] transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {isLoading ? 'Processing...' : 'Authenticate State'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          )}

          {/* Footer Branding */}
          <div className="pt-12 flex flex-col items-center">
             <div className="text-[10px] font-semibold text-[#87867f] tracking-[0.25em] uppercase mb-4">Institutional Reflective Service</div>
             <p className="text-[10px] text-[#87867f] leading-relaxed text-center font-medium px-4">
                Access to this system is restricted to verified CSIR-AMPRI officials.
                Unauthorized attempts are logged under Govt IT policy.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
