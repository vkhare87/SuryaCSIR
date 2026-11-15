import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Lock, ArrowRight, Mail, ExternalLink, Newspaper,
  Eye, EyeOff, Scale, Users, Clock, Map, Compass, BookOpen,
  FolderX, Layers, Lightbulb, Briefcase, GraduationCap, Microscope, Building2, Sparkles, ChevronDown,
} from 'lucide-react';
import { ROLE_ROUTES } from '../constants/roleRoutes';
import { resolvePostLoginPath } from '../lib/auth/postLogin';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { useCountUp } from '../utils/useCountUp';
import { Stagger } from '../components/ui/Stagger';
// The official marks, trimmed and resized from csir-logo.jpg / ampri-logo.png.
import csirLogo from '../assets/csir-mark.webp';
import ampriLogo from '../assets/ampri-mark.webp';

/** Both official marks side by side on a white plate; a logo is never recolored or cropped. */
function LogoLockup({ className }: { className: string }) {
  return (
    <div className="inline-flex items-center gap-4 rounded-2xl bg-white px-5 py-3 shadow-[var(--shadow-e2)]">
      <img src={csirLogo} alt="CSIR — Council of Scientific and Industrial Research" className={`${className} w-auto object-contain`} />
      <span className="self-stretch w-px bg-warm-sand" aria-hidden="true" />
      <img src={ampriLogo} alt="CSIR-AMPRI — Advanced Materials and Processes Research Institute, Bhopal" className={`${className} w-auto object-contain`} />
    </div>
  );
}

// The person who conceived and designed SURYA; shown as the signature on this page.
const AUTHOR = 'Vivek Khare';

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

const FIELD = 'w-full pl-12 pr-4 py-3.5 bg-background border border-border rounded-xl outline-none text-text font-medium transition-all placeholder:text-text-muted/70 hover:border-ring-warm focus:ring-2 focus:ring-terracotta/60 focus:border-terracotta';
const FIELD_LABEL = 'text-xs font-medium text-text-muted ml-1';
const FIELD_ICON = 'absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-terracotta transition-colors';

const TILE = 'rounded-xl border border-ivory/10 bg-ivory/[0.03]';
const TILE_HOVER = 'transition-all duration-300 hover:bg-terracotta/10 hover:border-terracotta/40 hover:-translate-y-1';
const ICON_BOX = 'w-10 h-10 rounded-lg bg-terracotta/20 flex items-center justify-center text-coral shrink-0';
const KICKER = 'text-[11px] font-semibold text-coral tracking-widest uppercase mb-2';
const HEADING = 'text-3xl lg:text-4xl font-[500] text-ivory font-serif mb-3';
const LEAD = 'text-sm text-warm-silver leading-relaxed max-w-2xl';

const STORY = ['What SURYA is', 'The name', 'The concept', 'The leverage', 'The road ahead', 'CSIR today', 'Quick links'];

// What the software holds, said plainly: one line per part of the institute's record.
const MODULES = [
  { icon: Users, title: 'People and posts', body: 'Staff, divisions, sanctioned posts, project staff, recruitment.' },
  { icon: Briefcase, title: 'Projects and proposals', body: 'From a first idea to sanction, progress reports and closure.' },
  { icon: Scale, title: 'Performance appraisal', body: 'Scientist self-report, evaluation committee, final score.' },
  { icon: GraduationCap, title: 'PhD scholars', body: 'Each scholar’s road from enrolment to thesis.' },
  { icon: Microscope, title: 'Instruments', body: 'What the institute owns, who runs it, and whether it works.' },
  { icon: BookOpen, title: 'Papers and patents', body: 'Publications and IP, linked to the people who made them.' },
  { icon: Building2, title: 'Committees and helpdesk', body: 'Meetings, decisions, action items and service requests.' },
  { icon: Sparkles, title: 'Ask SURYA', body: 'Questions answered from institute documents, with the page cited.' },
];

// The records that circle the sun. Angle in degrees, on three rings.
const ORBITS = [
  { r: 118, dur: '50s', nodes: [{ a: 25, label: 'People' }, { a: 205, label: 'Projects' }] },
  { r: 188, dur: '76s', nodes: [{ a: 80, label: 'Appraisal' }, { a: 200, label: 'Scholars' }, { a: 320, label: 'Instruments' }] },
  { r: 258, dur: '104s', nodes: [{ a: 10, label: 'Patents' }, { a: 135, label: 'Papers' }, { a: 255, label: 'Committees' }] },
];

/** The login's signature: the sun, and the institute's records in orbit round it. */
function SunOrbit({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="sun-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2b08f" />
          <stop offset="55%" stopColor="#d97757" />
          <stop offset="100%" stopColor="#c96442" />
        </radialGradient>
        <radialGradient id="sun-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c96442" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c96442" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="300" r="290" fill="url(#sun-halo)" className="animate-amber-glow" style={{ transformOrigin: '300px 300px' }} />
      {ORBITS.map(o => (
        <circle key={o.r} cx="300" cy="300" r={o.r} fill="none" stroke="#faf9f5" strokeOpacity="0.12" strokeDasharray="2 7" />
      ))}
      <g className="orbit" style={{ '--orbit': '90s' } as React.CSSProperties}>
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i} x1="300" y1="238" x2="300" y2="222" stroke="#d97757" strokeWidth="4" strokeLinecap="round"
            transform={`rotate(${i * 30} 300 300)`} className="sun-ray" style={{ animationDelay: `${(i % 4) * 0.6}s` }}
          />
        ))}
      </g>
      <circle cx="300" cy="300" r="48" fill="url(#sun-core)" />
      {ORBITS.map(o => (
        <g key={o.r} className="orbit" style={{ '--orbit': o.dur } as React.CSSProperties}>
          {o.nodes.map(n => {
            const rad = (n.a * Math.PI) / 180;
            return (
              <g key={n.label} transform={`translate(${300 + o.r * Math.cos(rad)} ${300 + o.r * Math.sin(rad)})`}>
                {/* The clear box keeps the label's centre on the dot, so it stays level as the ring turns. */}
                <g className="orbit-upright" style={{ '--orbit': o.dur } as React.CSSProperties}>
                  <rect x="-60" y="-26" width="120" height="52" fill="none" />
                  <circle r="6" fill="#d97757" />
                  <circle r="11" fill="none" stroke="#d97757" strokeOpacity="0.35" />
                  <text y="25" textAnchor="middle" fill="#faf9f5" fillOpacity="0.8" fontSize="13" fontWeight="500">{n.label}</text>
                </g>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** Desktop only: how much to enlarge the page so it fills a big screen as it fills a 1440×820 one. */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(
      window.innerWidth < 1024 ? 1 : Math.min(1.9, Math.max(0.8, Math.min(window.innerWidth / 1440, window.innerHeight / 820))),
    );
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { amount: 0.35, once: false },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [chapter, setChapter] = useState(0);
  const [reducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const storyRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale();
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (reducedMotion) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setTickerVisible(false);
      fade = setTimeout(() => {
        setTickerIndex(i => (i + 1) % ACHIEVEMENTS.length);
        setTickerVisible(true);
      }, 400);
    }, 4000);
    return () => { clearInterval(interval); clearTimeout(fade); };
  }, [reducedMotion]);

  // The dot of the chapter in view lights up.
  useEffect(() => {
    const root = storyRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setChapter(Number((e.target as HTMLElement).dataset.chapter));
    }, { threshold: 0.5 });
    root.querySelectorAll('[data-chapter]').forEach(el => seen.observe(el));
    return () => seen.disconnect();
  }, []);

  const goTo = (i: number) => storyRef.current
    ?.querySelector(`[data-chapter="${i}"]`)
    ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

  // Navigate to role-specific dashboard once auth and role are both resolved
  useEffect(() => {
    if (isAuthenticated && role) {
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(resolvePostLoginPath(from, ROLE_ROUTES[role]));
    }
  }, [isAuthenticated, role, navigate, location.state]);

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

  // One chapter of the story: a full panel on desktop, a plain block on a phone.
  const chapterProps = (i: number) => ({
    'data-chapter': i,
    'aria-label': STORY[i],
    className: 'relative lg:min-h-full lg:snap-start flex flex-col justify-center px-8 py-8 lg:px-12 lg:py-5',
  });
  const zoom = { zoom: scale };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background font-sans lg:h-screen lg:overflow-hidden">

      {/* ============ LEFT: the story, one smooth scroll ============ */}
      <div className="flex-1 min-w-0 bg-near-black flex flex-col lg:h-screen overflow-hidden relative">
        <NetworkCanvas className="absolute inset-0 w-full h-full pointer-events-none opacity-40" />

        {/* Persistent chrome: branding */}
        <div className="relative z-20 px-8 pt-8 lg:px-12 lg:pt-10">
          <div className="flex items-center gap-6" style={zoom}>
            <LogoLockup className="h-16 lg:h-20" />
            <div className="hidden md:block">
              <div className="text-[11px] font-semibold text-coral tracking-widest uppercase">Digital Sun Initiative</div>
              <div className="text-sm font-medium text-ivory mt-0.5">CSIR-Advanced Materials and Processes Research Institute</div>
              <div className="text-[11px] font-medium text-warm-silver tracking-wider">Bhopal</div>
            </div>
          </div>
        </div>

        <div
          ref={storyRef}
          className="relative z-10 flex-1 min-h-0 lg:overflow-y-auto lg:snap-y lg:snap-mandatory scroll-smooth scrollbar-hide overscroll-contain"
        >
          {/* ---- 1. What SURYA is ---- */}
          <section {...chapterProps(0)}>
            <SunOrbit className="absolute right-[-14%] top-1/2 -translate-y-1/2 w-[62%] max-h-[115%] aspect-square pointer-events-none hidden lg:block" />
            <div className="relative z-10 lg:max-w-[60%]"><div style={zoom}>
              <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
                <div className={KICKER}>The institute management and analytics system of CSIR-AMPRI</div>
                <h1 className="flex text-7xl lg:text-[6rem] leading-none font-[500] text-ivory tracking-tight font-serif" aria-label="SURYA">
                  {'SURYA'.split('').map((ch, i) => (
                    <motion.span
                      key={i} aria-hidden="true"
                      variants={{ hidden: { opacity: 0, y: 60, filter: 'blur(12px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)' } }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >{ch}</motion.span>
                  ))}
                </h1>
              </motion.div>

              <p className="mt-4 text-base text-ivory leading-relaxed border-l-2 border-terracotta pl-4">
                SURYA is where CSIR-AMPRI keeps its working record — people, projects, PhD scholars, instruments,
                papers and patents — and where the yearly performance appraisal of scientists runs from
                self-report to final score.
              </p>
              <p className="mt-3 text-sm text-warm-silver leading-relaxed">
                It is for everyone at the institute — leadership, scientists, technical staff, scholars,
                project staff and the offices. Each person signs in and sees their own part of it.
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {MODULES.map(m => {
                  const Icon = m.icon;
                  return (
                    <div key={m.title} title={m.body} className={`flex items-center gap-3 px-3 py-1.5 ${TILE} ${TILE_HOVER}`}>
                      <Icon size={18} className="text-coral shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-ivory truncate">{m.title}</div>
                        <div className="text-[11px] text-warm-silver truncate">{m.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div></div>
            <button
              type="button" onClick={() => goTo(1)}
              className="hidden lg:flex absolute bottom-1 right-12 items-center gap-2 text-[11px] font-medium text-warm-silver hover:text-ivory uppercase tracking-widest"
            >
              <ChevronDown size={14} className={reducedMotion ? undefined : 'animate-bounce'} /> Scroll for the idea behind it
            </button>
          </section>

          {/* ---- 2. The name ---- */}
          <section {...chapterProps(1)}>
            <motion.div {...reveal} className="relative z-10 max-w-3xl" style={zoom}>
              <div className={KICKER}>The name</div>
              <h2 className={HEADING}>
                <span lang="sa" className="text-coral mr-3">सूर्य</span>The sun, and five promises
              </h2>
              <p className={`${LEAD} mb-8`}>{TAGLINE}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACRONYM.map(item => (
                  <div key={item.letter} className={`group flex gap-4 p-4 ${TILE} ${TILE_HOVER}`}>
                    <div className={`${ICON_BOX} font-serif text-xl transition-colors group-hover:bg-terracotta group-hover:text-ivory`}>{item.letter}</div>
                    <div>
                      <div className="text-sm font-semibold text-ivory">{item.title}</div>
                      <div className="text-xs text-warm-silver leading-relaxed mt-0.5">{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* ---- 3. The concept — an institute that remembers ---- */}
          <section {...chapterProps(2)}>
            <motion.div {...reveal} className="relative z-10 max-w-3xl" style={zoom}>
              <div className={KICKER}>The Concept</div>
              <h2 className={HEADING}>An institute that remembers</h2>
              <p className={`${LEAD} mb-8`}>
                A research institute is more than its buildings — it is decades of people, projects, results,
                and hard-won know-how. SURYA exists so none of that is ever lost, and all of it is put to work.
              </p>
              <div className="space-y-4">
                {CONCEPT_POINTS.map(p => {
                  const Icon = p.icon;
                  return (
                    <div key={p.title} className={`flex gap-4 p-5 ${TILE}`}>
                      <div className={ICON_BOX}><Icon size={20} /></div>
                      <div>
                        <div className="text-sm font-semibold text-ivory mb-1">{p.title}</div>
                        <div className="text-xs text-warm-silver leading-relaxed">{p.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ---- 4. The leverage / 5. The road ahead ---- */}
          {[
            { i: 3, kicker: 'The Leverage', heading: 'What one trusted record makes possible', items: LEVERAGE,
              lead: 'When the institute’s work is recorded once, well, and in one place, everything built on top of it gets faster, fairer, and clearer.' },
            { i: 4, kicker: 'The Road Ahead', heading: 'What one lab starts, thirty-eight can share', items: FUTURE,
              lead: 'SURYA begins at CSIR-AMPRI. The same idea — an institution that keeps and uses its own record — can serve every laboratory in the CSIR family.' },
          ].map(c => (
            <section key={c.i} {...chapterProps(c.i)}>
              <motion.div {...reveal} className="relative z-10 max-w-3xl" style={zoom}>
                <div className={KICKER}>{c.kicker}</div>
                <h2 className={HEADING}>{c.heading}</h2>
                <p className={`${LEAD} mb-8`}>{c.lead}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {c.items.map(f => {
                    const Icon = f.icon;
                    return (
                      <div key={f.title} className={`group p-5 ${TILE} ${TILE_HOVER}`}>
                        <div className={`${ICON_BOX} mb-3 transition-colors group-hover:bg-terracotta group-hover:text-ivory`}><Icon size={20} /></div>
                        <div className="text-sm font-semibold text-ivory mb-1">{f.title}</div>
                        <div className="text-xs text-warm-silver leading-relaxed">{f.body}</div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </section>
          ))}

          {/* ---- 6. CSIR today ---- */}
          <section {...chapterProps(5)}>
            <motion.div {...reveal} className="relative z-10 max-w-3xl" style={zoom}>
              <div className={KICKER}>Council of Scientific and Industrial Research</div>
              <h2 className={HEADING}>A Nation’s Research Backbone</h2>
              <p className={LEAD}>
                CSIR operates 38 national laboratories across India, advancing science from materials and energy to
                health and aerospace. CSIR-AMPRI, Bhopal anchors advanced materials and processes research.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                {CSIR_STATS.map(stat => (
                  <div key={stat.label} className={`p-4 text-center ${TILE}`}>
                    <div className="text-3xl font-[600] text-coral font-serif tabular-nums">
                      {chapter === 5 ? <StatCounter target={stat.target} suffix={stat.suffix} /> : <span>0</span>}
                    </div>
                    <div className="text-[10px] text-warm-silver uppercase tracking-widest mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div className={`mt-5 px-4 py-3 ${TILE}`}>
                <div className="text-[10px] font-semibold text-stone-gray uppercase tracking-widest mb-1">Did you know</div>
                <div
                  className="text-sm text-ivory/85 leading-relaxed italic transition-opacity duration-300 min-h-[2.75rem]"
                  style={{ opacity: tickerVisible ? 1 : 0 }}
                >
                  {ACHIEVEMENTS[tickerIndex]}
                </div>
              </div>
            </motion.div>
          </section>

          {/* ---- 7. Quick links ---- */}
          <section {...chapterProps(6)}>
            <motion.div {...reveal} className="relative z-10 max-w-4xl" style={zoom}>
              <div className={KICKER}>Before you sign in</div>
              <h2 className={HEADING}>Other doors you may need</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                  {QUICK_LINKS.map(link => (
                    <a
                      key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                      className={`group flex items-center justify-between gap-2 px-3 py-2.5 ${TILE} transition-all hover:bg-terracotta/10 hover:border-terracotta/40`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-ivory truncate">{link.label}</div>
                        <div className="text-[10px] text-stone-gray truncate">{link.sub}</div>
                      </div>
                      <ExternalLink size={13} className="text-stone-gray group-hover:text-coral shrink-0 transition-colors" />
                    </a>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-stone-gray uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Newspaper size={12} /> CSIR News
                  </div>
                  <div className={`p-3 space-y-3 ${TILE}`}>
                    {NEWS.map((n, i) => (
                      <div key={i} className="flex gap-2">
                        <div className="w-1 shrink-0 rounded-full bg-terracotta/60" />
                        <p className="text-[11px] text-ivory/85 leading-snug">{n}</p>
                      </div>
                    ))}
                    <a
                      href="https://csirnews.niscpr.res.in/" target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 mt-1 rounded-lg border border-terracotta/40 bg-terracotta/10 px-3 py-2 text-[10px] font-semibold text-coral uppercase tracking-widest hover:bg-terracotta/20 transition-colors"
                    >
                      View CSIR News Portal <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>
        </div>

        {/* Persistent chrome: signature + chapter dots */}
        <div className="relative z-20 border-t border-ivory/10 px-8 py-4 lg:px-12">
          <div className="flex flex-wrap items-center justify-between gap-4" style={zoom}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-1 bg-terracotta" />
              <div>
                <div className="text-[10px] font-medium text-warm-silver uppercase tracking-[0.25em]">Conceptualised and designed by</div>
                <div className="font-serif italic text-lg leading-tight text-coral">{AUTHOR}</div>
              </div>
            </div>
            <nav aria-label="Chapters" className="hidden lg:flex items-center gap-3">
              {STORY.map((title, i) => (
                <button
                  key={title} type="button" aria-label={title} title={title} aria-current={i === chapter || undefined}
                  onClick={() => goTo(i)}
                  className={`relative after:absolute after:-inset-2 h-2 rounded-full transition-all duration-300 ${
                    i === chapter ? 'w-8 bg-coral' : 'w-2 bg-ivory/25 hover:bg-ivory/50'
                  }`}
                />
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* ============ RIGHT: fixed auth panel ============ */}
      <div className="order-first lg:order-last lg:w-[clamp(440px,34vw,760px)] lg:shrink-0 lg:h-screen bg-surface flex flex-col items-center justify-center p-8 lg:p-14 relative lg:overflow-y-auto">
        <div className="w-full max-w-sm" style={zoom}>
        <Stagger className="space-y-8">

          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <LogoLockup className="h-24" />
            <div className="mt-7 font-serif text-5xl leading-none text-terracotta" lang="sa" aria-hidden="true">सूर्य</div>
            <h2 className="mt-3 text-2xl lg:text-[1.75rem] font-[500] text-text tracking-tight font-serif leading-tight">Sign in to SURYA</h2>
            <p className="mt-1.5 text-sm text-text-muted">{greeting()}. Use your institute email.</p>
          </div>

          {magicLinkSent ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-16 h-16 rounded-full bg-archive-green/10 border border-archive-green/30 flex items-center justify-center text-archive-green">
                  <Mail size={28} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text mb-1">Check your inbox</p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    A sign-in link has been sent to<br />
                    <span className="font-semibold text-text">{email}</span>.<br />
                    Click the link in the email to access SURYA.
                  </p>
                </div>
                <p className="text-xs text-text-muted leading-relaxed px-2">
                  Your account requires a one-time recovery. After signing in via the link,
                  contact your administrator to restore normal password access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setMagicLinkSent(false); setError(''); }}
                className="w-full py-3 border border-border rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className={FIELD_LABEL}>Institute email</label>
                <div className="relative group">
                  <div className={FIELD_ICON}>
                    <Mail size={18} />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={FIELD}
                    placeholder="Institute email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className={FIELD_LABEL}>Password</label>
                <div className="relative group">
                  <div className={FIELD_ICON}>
                    <Lock size={18} />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${FIELD} pr-12`}
                    placeholder="Password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div role="alert" className="text-sm text-badge-danger-fg bg-badge-danger-bg p-3.5 rounded-xl border border-badge-danger-fg/25">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 [background:var(--gradient-brand)] hover:brightness-105 text-ivory rounded-xl font-semibold text-sm flex items-center justify-center gap-3 shadow-[var(--shadow-e2)] transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          )}

          {/* Footer Branding */}
          <div className="pt-2 flex flex-col items-center border-t border-border">
            
            <p className="mt-4 text-xs text-text-muted leading-relaxed text-center px-4">
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
              className="mt-4 p-2 text-xs text-text-muted hover:text-terracotta transition-colors underline underline-offset-2"
            >
              Reset App
            </button>
          </div>
        </Stagger>
        </div>
      </div>
    </div>
  );
}
