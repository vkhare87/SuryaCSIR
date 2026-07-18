import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Lock, ArrowRight, Mail, ExternalLink, Newspaper,
  Eye, Scale, Users, Clock, Map, Compass, BookOpen,
  FolderX, Layers, Lightbulb,
} from 'lucide-react';
import { ROLE_ROUTES } from '../constants/roleRoutes';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { useCountUp } from '../utils/useCountUp';
import csirLogo from '../assets/csir-logo.jpg';
import ampriLogo from '../assets/ampri-logo.png';

const TAGLINE =
  'One living record of the institute — its people, its work, and what it makes possible.';

const ACRONYM = [
  { letter: 'S', title: 'Scientific Research & Synergy', body: 'The core energy source of R&D innovation.' },
  { letter: 'U', title: 'Unified Human Capital', body: 'Centralized platform illuminating institutional talent.' },
  { letter: 'R', title: 'Ray of Growth & Outreach', body: 'Extending influence through proactive commercialization.' },
  { letter: 'Y', title: 'Yardstick for Excellence', body: 'Fair, illuminating performance and appraisal system.' },
  { letter: 'A', title: 'All-in-one Agile Platform', body: 'An overarching ecosystem connecting all institute functions.' },
];

const CSIR_STATS = [
  { label: 'National Labs', target: 38 },
  { label: 'Scientists', target: 4700, suffix: '+' },
  { label: 'Years of R&D', target: 78 },
  { label: 'Patents Filed', target: 4800, suffix: '+' },
];

const ACHIEVEMENTS = [
  'First Indian institute to develop anti-malarial drugs — 1947',
  'CSIR-NAL built India’s first civilian aircraft, Saras',
  'CSIR-CFTRI: world-class food science safeguarding nutrition since 1950',
  'Open Source Drug Discovery — crowdsourced TB & malaria research',
  'Materials & alloys powering India’s space & defense programs',
  '38 national laboratories spanning every scientific discipline',
];

const QUICK_LINKS = [
  { label: 'NIC Email', sub: 'accounts.mgovcloud.in', href: 'https://accounts.mgovcloud.in/' },
  { label: 'AMPRI IRINS', sub: 'Research profiles', href: 'https://ampri.irins.org/' },
  { label: 'EHRMS', sub: 'e-HRMS portal', href: 'https://e-hrms.gov.in/login' },
  { label: 'eOffice', sub: 'CSIR file system', href: 'https://eoffice.csir.res.in/' },
  { label: 'CSIR RAB', sub: 'Recruitment & Assessment', href: 'https://rab.csir.res.in/' },
  { label: 'AMPRI Recruitment', sub: 'Openings & notices', href: 'https://ampri.res.in/?page_id=343' },
  { label: 'SPARROW', sub: 'APAR system', href: 'https://sparrow-dsir.eoffice.gov.in/' },
  { label: 'PFMS', sub: 'Financial management', href: 'https://pfms.nic.in/SitePages/Users/LoginDetails/Login.aspx' },
];

const NEWS = [
  'CSIR ranks among the world’s top publicly funded research organizations',
  'AMPRI advances in lightweight materials & sustainable processing',
  'CSIR labs lead national missions in energy, health & advanced materials',
];

const CONCEPT_POINTS = [
  { icon: FolderX, title: 'Scattered Today', body: 'Staff records, projects, publications, patents, and equipment logs live in separate files, registers, and inboxes — and much of it leaves when people transfer or retire.' },
  { icon: Layers, title: 'Gathered in One Place', body: 'SURYA brings these records together into a single, carefully governed account of the institute that grows with every year of work.' },
  { icon: Lightbulb, title: 'The Full Picture', body: 'When the record is whole, every decision — hiring, funding, assessment, planning — starts from what the institute actually knows about itself.' },
];

const LEVERAGE = [
  { icon: Eye, title: 'The Complete Picture', body: 'Leadership sees strengths, gaps, workloads, and outcomes across every division at a glance — not after weeks of compilation.' },
  { icon: Scale, title: 'Fair Assessment', body: 'Performance is weighed against the recorded work itself — stage by stage, in the open — so recognition follows contribution.' },
  { icon: Users, title: 'Discoverable Expertise', body: 'Who has worked on what, with which equipment, and with whom — answered in minutes, opening collaborations that never used to happen.' },
  { icon: Clock, title: 'Time Back for Science', body: 'Reports and returns that once consumed weeks of scientists’ time are drawn from the record in minutes.' },
];

const FUTURE = [
  { icon: Scale, title: 'A Common Yardstick', body: 'The same fair, transparent measure of scientific work, usable by any laboratory in the network.' },
  { icon: Map, title: 'A National Capability Map', body: 'Expertise, facilities, and equipment across 38 labs — visible as one national resource.' },
  { icon: Compass, title: 'Faster National Answers', body: '“Who in CSIR can do this?” answered in hours, not months — for missions, industry, and policy.' },
  { icon: BookOpen, title: 'Memory Across Generations', body: 'What a scientist builds over a career stays with the institution, ready for the next generation to build on.' },
];

function StatCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [active, setActive] = useState(false);
  useEffect(() => { const t = setTimeout(() => setActive(true), 300); return () => clearTimeout(t); }, []);
  const count = useCountUp(target, 1400, active);
  return <span>{count.toLocaleString()}{suffix}</span>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const SLIDE_COUNT = 5;
const SLIDE_INTERVAL_MS = 9000;

const SLIDE_TITLES = ['SURYA', 'The Concept', 'The Leverage', 'The Road Ahead', 'CSIR Today'];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
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

  // Auto-advance slides; including `slide` in deps resets the timer after a manual jump
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSlide(s => (s + 1) % SLIDE_COUNT), SLIDE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, slide]);

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
    } catch (_err) {
      setError('Connection error. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const slideContent = [
    /* ---- Slide 1: SURYA hero ---- */
    <div key="hero" className="relative h-full flex flex-col justify-center">
      <NetworkCanvas className="absolute inset-0 w-full h-full pointer-events-none opacity-70" />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="relative flex items-center gap-6">
          <div
            className="absolute -left-16 top-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full pointer-events-none animate-amber-glow"
            style={{ background: 'radial-gradient(circle, rgba(201,100,66,0.45) 0%, rgba(201,100,66,0.12) 35%, transparent 70%)' }}
          />
          <h1 className="relative text-7xl lg:text-[9rem] font-[500] text-[#faf9f5] tracking-tight font-serif">SURYA</h1>
          <div className="relative text-[#d97757] animate-sun">
            <Sun size={72} strokeWidth={3} />
          </div>
        </div>

        <p className="relative max-w-2xl text-sm lg:text-base text-[#d6d4cb] leading-relaxed font-medium border-l-2 border-[#c96442] pl-4">
          {TAGLINE}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 max-w-3xl">
          {ACRONYM.map(item => (
            <div
              key={item.letter}
              className="group flex gap-3 rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-3 transition-all duration-300 hover:bg-[#c96442]/10 hover:border-[#c96442]/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#c96442]/10 cursor-default"
            >
              <div className="w-9 h-9 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] font-semibold text-lg shrink-0 transition-colors group-hover:bg-[#c96442] group-hover:text-[#faf9f5]">
                {item.letter}
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#faf9f5] uppercase tracking-wider">{item.title}</div>
                <div className="text-[10px] text-[#b0aea5] leading-relaxed mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ---- Slide 2: The concept — an institute that remembers ---- */
    <div key="concept" className="relative h-full flex flex-col justify-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#c96442]/5 pointer-events-none" />
      <div className="relative z-10 max-w-3xl">
        <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase mb-1">The Concept</div>
        <h2 className="text-3xl lg:text-4xl font-[500] text-[#faf9f5] font-serif mb-3">An institute that remembers</h2>
        <p className="text-sm text-[#b0aea5] leading-relaxed mb-8 max-w-2xl">
          A research institute is more than its buildings — it is decades of people, projects, results,
          and hard-won know-how. SURYA exists so none of that is ever lost, and all of it is put to work.
        </p>

        <div className="space-y-4">
          {CONCEPT_POINTS.map(p => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex gap-4 rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-5">
                <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] shrink-0">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#faf9f5] mb-1">{p.title}</div>
                  <div className="text-[11px] text-[#b0aea5] leading-relaxed">{p.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,

    /* ---- Slide 3: The leverage ---- */
    <div key="leverage" className="relative h-full flex flex-col justify-center">
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#c96442]/5 rounded-full -translate-x-1/3 translate-y-1/3 pointer-events-none" />
      <div className="relative z-10 max-w-3xl">
        <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase mb-1">The Leverage</div>
        <h2 className="text-3xl lg:text-4xl font-[500] text-[#faf9f5] font-serif mb-3">What one trusted record makes possible</h2>
        <p className="text-sm text-[#b0aea5] leading-relaxed mb-8">
          When the institute’s work is recorded once, well, and in one place, everything built on top
          of it gets faster, fairer, and clearer.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LEVERAGE.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-5 transition-all duration-300 hover:bg-[#c96442]/10 hover:border-[#c96442]/40 hover:-translate-y-1"
              >
                <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] mb-3 transition-colors group-hover:bg-[#c96442] group-hover:text-[#faf9f5]">
                  <Icon size={20} />
                </div>
                <div className="text-sm font-semibold text-[#faf9f5] mb-1">{f.title}</div>
                <div className="text-[11px] text-[#b0aea5] leading-relaxed">{f.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,

    /* ---- Slide 4: Future possibilities for CSIR ---- */
    <div key="future" className="relative h-full flex flex-col justify-center">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#c96442]/5 rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="relative z-10 max-w-3xl">
        <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase mb-1">The Road Ahead</div>
        <h2 className="text-3xl lg:text-4xl font-[500] text-[#faf9f5] font-serif mb-3">What one lab starts, thirty-eight can share</h2>
        <p className="text-sm text-[#b0aea5] leading-relaxed mb-8">
          SURYA begins at CSIR-AMPRI. The same idea — an institution that keeps and uses its own
          record — can serve every laboratory in the CSIR family.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FUTURE.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-5 transition-all duration-300 hover:bg-[#c96442]/10 hover:border-[#c96442]/40 hover:-translate-y-1"
              >
                <div className="w-10 h-10 rounded-lg bg-[#c96442]/20 flex items-center justify-center text-[#d97757] mb-3 transition-colors group-hover:bg-[#c96442] group-hover:text-[#faf9f5]">
                  <Icon size={20} />
                </div>
                <div className="text-sm font-semibold text-[#faf9f5] mb-1">{f.title}</div>
                <div className="text-[11px] text-[#b0aea5] leading-relaxed">{f.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,

    /* ---- Slide 5: CSIR today + launchpad ---- */
    <div key="csir" className="relative h-full flex flex-col justify-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#c96442]/5 pointer-events-none" />
      <div className="relative z-10">
        <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase mb-1">Council of Scientific & Industrial Research</div>
        <h2 className="text-3xl lg:text-4xl font-[500] text-[#faf9f5] font-serif mb-2">A Nation’s Research Backbone</h2>
        <p className="max-w-2xl text-sm text-[#b0aea5] leading-relaxed">
          CSIR operates 38 national laboratories across India, advancing science from materials and energy to
          health and aerospace. CSIR-AMPRI, Bhopal anchors advanced materials & processes research.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 max-w-2xl">
          {CSIR_STATS.map(stat => (
            <div key={stat.label} className="rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-4 text-center">
              <div className="text-2xl font-[600] text-[#d97757] font-serif tabular-nums">
                <StatCounter target={stat.target} suffix={stat.suffix} />
              </div>
              <div className="text-[10px] text-[#b0aea5] uppercase tracking-widest mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 max-w-2xl rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] px-4 py-3">
          <div className="text-[9px] font-semibold text-[#87867f] uppercase tracking-widest mb-1">Did you know</div>
          <div
            className="text-xs text-[#d6d4cb] leading-relaxed italic transition-opacity duration-300 min-h-[2.5rem]"
            style={{ opacity: tickerVisible ? 1 : 0 }}
          >
            {ACHIEVEMENTS[tickerIndex]}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 max-w-4xl">
          <div className="lg:col-span-2">
            <div className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest mb-3">Institutional Quick Links</div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-2 rounded-lg border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] px-3 py-2.5 transition-all hover:bg-[#c96442]/10 hover:border-[#c96442]/40"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[#faf9f5] truncate">{link.label}</div>
                    <div className="text-[9px] text-[#87867f] truncate">{link.sub}</div>
                  </div>
                  <ExternalLink size={13} className="text-[#87867f] group-hover:text-[#d97757] shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Newspaper size={12} /> CSIR News
            </div>
            <div className="rounded-xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] p-3 space-y-3">
              {NEWS.map((n, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-1 shrink-0 rounded-full bg-[#c96442]/60" />
                  <p className="text-[11px] text-[#d6d4cb] leading-snug">{n}</p>
                </div>
              ))}
              <a
                href="https://csirnews.niscpr.res.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 mt-1 rounded-lg border border-[#c96442]/40 bg-[#c96442]/10 px-3 py-2 text-[10px] font-semibold text-[#d97757] uppercase tracking-widest hover:bg-[#c96442]/20 transition-colors"
              >
                View CSIR News Portal <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
  ];

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f5f4ed] font-sans lg:h-screen lg:overflow-hidden">

      {/* ============ LEFT: auto-running slide deck ============ */}
      <div
        className="flex-1 bg-[#141413] flex flex-col min-h-[720px] lg:h-screen overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Persistent chrome: branding */}
        <div className="flex items-start gap-6 relative z-20 p-10 pb-0 lg:p-12 lg:pb-0">
          <div className="bg-[#faf9f5] p-3 rounded-xl flex flex-col items-center gap-2 w-28 scale-90 lg:scale-100">
            <img src={csirLogo} alt="CSIR" className="w-12 h-12 object-contain rounded" />
            <div className="text-[8px] font-semibold leading-tight text-center text-[#4d4c48] uppercase">Council of Scientific & Industrial Research</div>
          </div>

          <div className="bg-[#faf9f5] p-3 rounded-xl flex flex-col items-center gap-2 w-28 scale-90 lg:scale-100">
            <img src={ampriLogo} alt="CSIR-AMPRI" className="w-12 h-12 object-contain" />
            <div className="text-[8px] font-semibold leading-tight text-center text-[#4d4c48] uppercase">Advanced Materials & Processes Research Institute</div>
          </div>

          <div className="ml-4 pt-2 hidden md:block">
            <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase">Digital Sun Initiative</div>
            <div className="text-[10px] font-medium text-[#b0aea5] tracking-wider">CSIR-AMPRI BHOPAL</div>
          </div>
        </div>

        {/* Slide viewport — key remount replays the CSS slide-in animation */}
        <div className="relative flex-1 min-h-0">
          <div
            key={slide}
            className="absolute inset-0 overflow-y-auto scrollbar-hide p-10 pt-6 lg:p-12 lg:pt-6 animate-slide-in"
          >
            {slideContent[slide]}
          </div>
        </div>

        {/* Persistent chrome: footer + dot navigation */}
        <div className="relative z-20 flex items-end justify-between gap-6 border-t border-[#faf9f5]/10 p-10 pt-5 lg:px-12 lg:py-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-1 bg-[#c96442]" />
            <div>
              <div className="text-2xl font-[500] text-[#d97757] leading-tight font-serif">सूर्य</div>
              <div className="text-[10px] font-semibold text-[#b0aea5] tracking-[0.4em] uppercase">The Digital Sun</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {SLIDE_TITLES.map((title, i) => (
              <button
                key={title}
                type="button"
                aria-label={title}
                onClick={() => setSlide(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === slide ? 'w-8 bg-[#d97757]' : 'w-2 bg-[#faf9f5]/25 hover:bg-[#faf9f5]/50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ============ RIGHT: fixed auth panel ============ */}
      <div className="lg:w-[500px] lg:h-screen bg-[#faf9f5] flex flex-col items-center justify-center p-8 lg:p-16 relative lg:overflow-y-auto">
        <div className="w-full max-w-sm space-y-10">

          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-[#faf9f5] rounded-[16px] p-3 mb-6 shadow-[0px_0px_0px_1px_#f0eee6] flex items-center justify-center">
              <img src={ampriLogo} alt="CSIR-AMPRI" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-2xl lg:text-[1.75rem] font-[500] text-[#141413] tracking-tight mb-2 font-serif leading-tight">Sign in to SURYA</h2>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-semibold tracking-[0.2em] text-[#87867f] uppercase">Authorized Institutional Access</span>
              <div className="h-1 w-24 bg-[#c96442] mt-2 rounded-full" />
            </div>

            {/* Contextual greeting */}
            <div className="mt-6 w-full rounded-xl border border-[#f0eee6] bg-[#f5f4ed] px-4 py-3">
              <div className="text-sm font-semibold text-[#141413]">{greeting()}</div>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#16a34a] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16a34a]" />
                </span>
                <span className="text-[10px] font-medium text-[#87867f] uppercase tracking-widest">CSIR-AMPRI Strategic Network Active</span>
              </div>
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
                <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">Institutional Email</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#c96442] transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#c96442] focus:border-[#c96442] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                    placeholder="Institutional Email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">Secure Passphrase</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#c96442] transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#c96442] focus:border-[#c96442] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                    placeholder="Secure Passphrase"
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
              className="w-full py-4 [background:var(--gradient-brand)] hover:brightness-105 text-[#faf9f5] rounded-lg font-semibold text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-[var(--shadow-e2)] transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          )}

          {/* Footer Branding */}
          <div className="pt-6 flex flex-col items-center">
            <div className="text-[10px] font-semibold text-[#87867f] tracking-[0.25em] uppercase mb-4">Institutional Reflective Service</div>
            <p className="text-[10px] text-[#87867f] leading-relaxed text-center font-medium px-4">
              Access to this system is restricted to verified CSIR-AMPRI officials.
              Unauthorized attempts are logged under Govt IT policy.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('This will clear all local app data (theme, credentials, cached settings). Continue?')) {
                  localStorage.removeItem('surya_supabase_url');
                  localStorage.removeItem('surya_supabase_anon_key');
                  localStorage.removeItem('surya_theme');
                  localStorage.removeItem('surya_density');
                  localStorage.removeItem('surya_session');
                  window.location.reload();
                }
              }}
              className="mt-6 text-[10px] text-[#b0aea5] hover:text-[#c96442] transition-colors underline underline-offset-2"
            >
              Reset App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
