import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, Award, Bell, CalendarDays, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardList, Cloud, Compass, Eye, EyeOff, FileBadge2, Flag,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Search, ShieldCheck,
  ShieldUser, Sun, Trophy, Users, UserRound, X, Zap, Goal
} from "lucide-react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile, User
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";

type Page = "Inicio" | "Jugadores" | "Clubes" | "Competiciones" | "Directorio" | "Credenciales";
const navItems: { label: Page; icon: typeof LayoutDashboard; detail: string }[] = [
  { label: "Inicio", icon: LayoutDashboard, detail: "Resumen de tu actividad deportiva" },
  { label: "Jugadores", icon: Users, detail: "Perfiles y desarrollo de jugadores" },
  { label: "Clubes", icon: ShieldUser, detail: "Clubes, plantillas y cuerpos técnicos" },
  { label: "Competiciones", icon: Trophy, detail: "Ligas, torneos y temporadas" },
  { label: "Directorio", icon: Compass, detail: "Encuentra talento y profesionales" },
  { label: "Credenciales", icon: FileBadge2, detail: "Identificación deportiva verificable" },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <div className="brand-mark"><Goal size={25} strokeWidth={2.5} /></div>
    {!compact && <div><div className="brand-name">CASCARITA</div><div className="brand-tagline">DONDE COMIENZA TU HISTORIA</div></div>}
  </div>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !db) { setError("Firebase aún no está configurado. Completa el archivo .env.local."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "register") {
        if (name.trim().length < 2) throw new Error("Escribe tu nombre para continuar.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await setDoc(doc(db, "users", credential.user.uid), {
          displayName: name.trim(), email: email.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/email-already-in-use": "Este correo ya tiene una cuenta.",
        "auth/invalid-email": "El correo no tiene un formato válido.",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
        "auth/invalid-credential": "Correo o contraseña incorrectos.",
        "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
        "permission-denied": "Firestore rechazó la creación del perfil. Revisa que las reglas iniciales estén publicadas."
      };
      setError(messages[code || ""] || (err instanceof Error ? err.message : "No fue posible completar la operación."));
    } finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-visual-top"><Brand /></div>
      <div className="auth-hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> EL FÚTBOL NOS UNE</div>
        <h1>Tu historia<br/><em>comienza</em><br/>en la cancha.</h1>
        <p>Una comunidad para descubrir talento, organizar clubes y llevar el fútbol de nuestra gente más lejos.</p>
        <div className="hero-foot"><span>DEL BARRIO A LA CANCHA.</span><span>DE LA PASIÓN AL PROGRESO.</span></div>
      </div>
      <div className="auth-ball"><div className="ball-lines">⚽</div></div>
      <div className="auth-visual-footer">CASCARITA <span>•</span> FÚTBOL CON FUTURO</div>
    </section>
    <section className="auth-panel">
      <div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-card">
        <div className="auth-kicker">BIENVENIDO A CASCARITA</div>
        <h2>{mode === "login" ? "Qué bueno tenerte aquí." : "Únete a la comunidad."}</h2>
        <p className="muted">{mode === "login" ? "Inicia sesión para continuar tu camino." : "Crea tu cuenta y comienza tu historia deportiva."}</p>
        {!firebaseReady && <div className="notice warning"><Cloud size={17}/> Configura las variables Firebase en .env.local para habilitar el acceso.</div>}
        {error && <div className="notice error">{error}</div>}
        {notice && <div className="notice success">{notice}</div>}
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && <label>Nombre completo<input value={name} onChange={e=>setName(e.target.value)} placeholder="Tu nombre" autoComplete="name" required /></label>}
          <label>Correo electrónico<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nombre@correo.com" autoComplete="email" required /></label>
          <label>Contraseña<div className="password-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required/><button type="button" className="icon-button password-toggle" onClick={()=>setShowPassword(!showPassword)} aria-label="Mostrar contraseña">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          <button className="primary-button auth-submit" disabled={busy || !firebaseReady}>{busy ? "Un momento..." : mode === "login" ? "Iniciar sesión" : "Crear mi cuenta"} <ArrowRight size={18}/></button>
        </form>
        <div className="auth-switch">{mode === "login" ? "¿Todavía no tienes cuenta?" : "¿Ya formas parte de CASCARITA?"} <button onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");}}>{mode === "login" ? "Regístrate" : "Inicia sesión"}</button></div>
        <div className="secure-note"><LockKeyhole size={14}/> Tu cuenta y tus datos se protegen con Firebase.</div>
      </div>
      <div className="auth-copyright">© 2026 CASCARITA · DONDE COMIENZA TU HISTORIA</div>
    </section>
  </main>;
}

function AppShell({ user }: { user: User }) {
  const [page, setPage] = useState<Page>("Inicio");
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const active = useMemo(() => navItems.find(n=>n.label===page)!, [page]);

  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  useEffect(() => {
    const handler = (event: Event) => setPage((event as CustomEvent<Page>).detail);
    window.addEventListener("cascarita:set-page", handler);
    return () => window.removeEventListener("cascarita:set-page", handler);
  }, []);

  async function logout() { if (auth) await signOut(auth); }

  return <div className="app-layout">
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><Brand /></div>
      <div className="workspace-label">PLATAFORMA DE FÚTBOL</div>
      <nav className="main-nav">
        <div className="nav-caption">MENÚ PRINCIPAL</div>
        {navItems.map(item => <button key={item.label} className={`nav-link ${page===item.label?"active":""}`} onClick={()=>{setPage(item.label);setSidebarOpen(false);}}>
          <item.icon size={19}/><span>{item.label}</span>{page===item.label&&<span className="nav-active-dot"/>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={18}/></div><strong>¿Necesitas ayuda?</strong><span>Estamos construyendo algo grande.</span></div>
        <div className="sidebar-user"><div className="avatar">{(user.displayName || user.email || "C").slice(0,1).toUpperCase()}</div><div className="user-meta"><strong>{user.displayName || "Mi cuenta"}</strong><span>Mi perfil</span></div><button className="icon-button" onClick={()=>setProfileOpen(!profileOpen)}><ChevronDown size={17}/></button></div>
        {profileOpen && <div className="profile-pop"><div className="profile-email">{user.email}</div><button onClick={logout}><LogOut size={16}/> Cerrar sesión</button></div>}
      </div>
    </aside>
    {sidebarOpen && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={()=>setSidebarOpen(false)}/>}
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={()=>setSidebarOpen(true)} aria-label="Abrir menú"><Menu/></button>
        <div className="breadcrumb"><span>Plataforma</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
        <div className="topbar-actions">
          <div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar en CASCARITA..."/></div>
          <button className="icon-button theme-button" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
          <button className="icon-button notification-button" aria-label="Notificaciones"><Bell size={19}/><i/></button>
          <button className="top-avatar" onClick={()=>setProfileOpen(!profileOpen)}>{(user.displayName || user.email || "C").slice(0,1).toUpperCase()}</button>
        </div>
      </header>
      <div className="page-content">
        <div className="welcome-row">
          <div><div className="section-overline">TU ESPACIO DEPORTIVO</div><h1>{page === "Inicio" ? <>Bienvenido, <span>{(user.displayName || "deportista").split(" ")[0]}.</span></> : page}</h1><p>{active.detail}</p></div>
          <div className="season-pill"><span className="live-dot"/> TEMPORADA · EN PREPARACIÓN</div>
        </div>
        {page === "Inicio" ? <Dashboard user={user}/> : <ModulePlaceholder page={page}/>}
        <footer className="page-footer"><span>© 2026 CASCARITA</span><span>DEL BARRIO A LA CANCHA. DE LA PASIÓN AL PROGRESO.</span><span>v0.1.0</span></footer>
      </div>
    </main>
  </div>;
}

function Dashboard({ user }: { user: User }) {
  return <>
    <section className="hero-banner">
      <div className="hero-banner-content"><div className="banner-label"><Zap size={14}/> UNA NUEVA FORMA DE VIVIR EL FÚTBOL</div><h2>El siguiente paso<br/>de tu historia <span>empieza aquí.</span></h2><p>Conecta con el fútbol, desarrolla tu talento y encuentra nuevas oportunidades.</p><button className="banner-button" onClick={()=>window.dispatchEvent(new CustomEvent("cascarita:navigate",{detail:"Jugadores"}))}>Explorar plataforma <ArrowRight size={17}/></button></div>
      <div className="banner-art"><div className="pitch-circle"/><div className="banner-ball">⚽</div><div className="banner-orbit orbit-one"/><div className="banner-orbit orbit-two"/></div>
      <div className="banner-index">01 <span>/ 04</span></div>
    </section>
    <div className="stats-grid">
      <Stat icon={Users} label="Jugadores" value="—" note="Perfiles por descubrir" tone="green"/>
      <Stat icon={ShieldUser} label="Clubes" value="—" note="Clubes de la comunidad" tone="blue"/>
      <Stat icon={Trophy} label="Competiciones" value="—" note="Próximamente" tone="orange"/>
      <Stat icon={Activity} label="Tu actividad" value="0" note="Tu camino comienza hoy" tone="purple"/>
    </div>
    <div className="content-grid">
      <section className="panel progress-panel"><div className="panel-heading"><div><div className="section-overline">TU PERFIL</div><h3>Todo comienza contigo</h3></div><div className="panel-icon"><UserRound size={19}/></div></div><div className="profile-progress"><div className="progress-avatar">{(user.displayName || "C").slice(0,1).toUpperCase()}</div><div className="progress-copy"><strong>{user.displayName || "Nuevo integrante"}</strong><span>Completa tu información cuando habilitemos tu perfil deportivo.</span></div></div><div className="progress-track"><span style={{width:"25%"}}/></div><div className="progress-foot"><span>Cuenta creada</span><strong>25%</strong></div><div className="soft-callout"><CheckCircle2 size={17}/> Tu cuenta ya forma parte de CASCARITA.</div></section>
      <section className="panel roadmap-panel"><div className="panel-heading"><div><div className="section-overline">EL CAMINO</div><h3>Lo que estamos construyendo</h3></div><div className="panel-icon"><Flag size={19}/></div></div><div className="roadmap-list"><Roadmap icon={ShieldCheck} title="Fundación de la plataforma" text="Identidad, acceso y estructura inicial." done/><Roadmap icon={Users} title="Clubes y jugadores" text="Perfiles, plantillas y membresías."/><Roadmap icon={Trophy} title="Competiciones y partidos" text="Ligas, calendarios y actas."/><Roadmap icon={Award} title="Evaluación y desarrollo" text="Medición y evolución deportiva."/></div></section>
    </div>
    <section className="quick-section"><div className="quick-heading"><div><div className="section-overline">DESCUBRE CASCARITA</div><h3>Un ecosistema para crecer</h3></div><span>PRÓXIMAMENTE</span></div><div className="quick-grid"><Quick icon={Users} title="Jugadores" text="Talento, posiciones y evolución."/><Quick icon={ShieldUser} title="Clubes" text="Identidad, equipos y comunidad."/><Quick icon={CalendarDays} title="Competiciones" text="Organización y competencia."/><Quick icon={ClipboardList} title="Directorio" text="Conecta con profesionales."/><Quick icon={FileBadge2} title="Credenciales" text="Identidad deportiva verificable."/></div></section>
  </>;
}
function Stat({icon:Icon,label,value,note,tone}:{icon:typeof Users;label:string;value:string;note:string;tone:string}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>}
function Roadmap({icon:Icon,title,text,done=false}:{icon:typeof Users;title:string;text:string;done?:boolean}){return <div className={`roadmap-item ${done?"done":""}`}><div className="roadmap-icon"><Icon size={17}/></div><div><strong>{title}</strong><span>{text}</span></div><div className="roadmap-status">{done?"LISTO":"EN PLAN"}</div></div>}
function Quick({icon:Icon,title,text}:{icon:typeof Users;title:string;text:string}){return <div className="quick-card"><div className="quick-icon"><Icon size={20}/></div><strong>{title}</strong><span>{text}</span><ArrowRight size={16} className="quick-arrow"/></div>}
function ModulePlaceholder({page}:{page:Page}){return <div className="module-empty"><div className="module-empty-icon"><Trophy size={30}/></div><div className="section-overline">MÓDULO EN CONSTRUCCIÓN</div><h2>{page}</h2><p>Estamos preparando este espacio para que funcione con datos reales, permisos adecuados y herramientas deportivas completas.</p><div className="module-feature-row"><span><ShieldCheck size={16}/> Seguridad desde el diseño</span><span><Activity size={16}/> Datos verificables</span><span><Users size={16}/> Comunidad deportiva</span></div><div className="module-note">Esta sección se habilitará en una próxima entrega de CASCARITA.</div></div>}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!auth) { setChecking(false); return; }
    return onAuthStateChanged(auth, current => { setUser(current); setChecking(false); });
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const page = (event as CustomEvent<Page>).detail;
      window.dispatchEvent(new CustomEvent("cascarita:set-page", { detail: page }));
    };
    window.addEventListener("cascarita:navigate", handler);
    return () => window.removeEventListener("cascarita:navigate", handler);
  }, []);
  if (checking) return <div className="loading-screen"><Brand/><div className="loader"/></div>;
  return user ? <AppShell user={user}/> : <AuthScreen/>;
}