import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const state = { user: null, page: "Inicio", theme: localStorage.getItem("cascarita-theme") || "light", authMode: "login" };
const root = document.getElementById("app");

const nav = [
  ["Inicio","⌂","Resumen de tu actividad deportiva"],
  ["Jugadores","♟","Perfiles y desarrollo de jugadores"],
  ["Clubes","⬟","Clubes, plantillas y cuerpos técnicos"],
  ["Competiciones","🏆","Ligas, torneos y temporadas"],
  ["Directorio","◎","Encuentra talento y profesionales"],
  ["Credenciales","▣","Identificación deportiva verificable"]
];

function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function initials(name="C") {
  return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "C";
}
function toast(message, type="info") {
  const host = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  host.append(el);
  setTimeout(()=>el.classList.add("show"),10);
  setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),250)},3600);
}
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cascarita-theme", theme);
}
setTheme(state.theme);

function authView() {
  const register = state.authMode === "register";
  root.innerHTML = `
  <main class="auth-layout">
    <section class="auth-art">
      <div class="auth-brand"><div class="brand-mark">⚽</div><div><b>CASCARITA</b><small>DONDE COMIENZA TU HISTORIA</small></div></div>
      <div class="art-copy">
        <div class="eyebrow"><i></i> EL FÚTBOL NOS UNE</div>
        <h1>Tu historia<br><em>comienza</em><br>en la cancha.</h1>
        <p>Una comunidad para descubrir talento, organizar clubes y llevar el fútbol de nuestra gente más lejos.</p>
        <div class="art-motto"><span>DEL BARRIO A LA CANCHA.</span><span>DE LA PASIÓN AL PROGRESO.</span></div>
      </div>
      <div class="giant-ball">⚽</div>
      <div class="art-foot">CASCARITA <span>•</span> FÚTBOL CON FUTURO</div>
    </section>
    <section class="auth-side">
      <div class="mobile-brand auth-brand"><div class="brand-mark">⚽</div><div><b>CASCARITA</b><small>DONDE COMIENZA TU HISTORIA</small></div></div>
      <div class="auth-card">
        <div class="eyebrow green">BIENVENIDO A CASCARITA</div>
        <h2>${register ? "Únete a la comunidad." : "Qué bueno tenerte aquí."}</h2>
        <p class="sub">${register ? "Crea tu cuenta y comienza tu historia deportiva." : "Inicia sesión para continuar tu camino."}</p>
        <div id="auth-error" class="form-error" hidden></div>
        <form id="auth-form">
          ${register ? `<label>Nombre completo<input name="name" autocomplete="name" placeholder="Tu nombre" required minlength="2"></label>` : ""}
          <label>Correo electrónico<input name="email" type="email" autocomplete="email" placeholder="nombre@correo.com" required></label>
          <label>Contraseña<input name="password" type="password" autocomplete="${register?"new-password":"current-password"}" placeholder="Mínimo 6 caracteres" minlength="6" required></label>
          <button class="btn-primary full" type="submit">${register?"Crear mi cuenta":"Iniciar sesión"} <span>→</span></button>
        </form>
        <div class="auth-switch">${register?"¿Ya formas parte de CASCARITA?":"¿Todavía no tienes cuenta?"} <button id="switch-auth">${register?"Inicia sesión":"Regístrate"}</button></div>
        <div class="secure-note">♧ Tu cuenta se protege con Firebase Authentication.</div>
      </div>
      <div class="auth-copyright">© 2026 CASCARITA · DONDE COMIENZA TU HISTORIA</div>
    </section>
  </main>`;

  document.getElementById("switch-auth").onclick = () => {
    state.authMode = register ? "login" : "register";
    authView();
  };
  document.getElementById("auth-form").onsubmit = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const name = String(form.get("name") || "").trim();
    const button = e.currentTarget.querySelector("button[type=submit]");
    const error = document.getElementById("auth-error");
    button.disabled = true; button.innerHTML = "Un momento...";
    error.hidden = true;
    try {
      if (register) {
        const cred = await createUserWithEmailAndPassword(auth,email,password);
        await updateProfile(cred.user,{displayName:name});
        // El perfil básico se crea en Firestore. Si las reglas aún no permiten
        // esta operación, la cuenta Auth seguirá creada y se mostrará el aviso.
        try {
          await setDoc(doc(db,"users",cred.user.uid),{
            displayName:name,email,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
          });
        } catch (profileError) {
          console.warn("Cuenta creada; perfil Firestore pendiente de reglas:",profileError);
          toast("Cuenta creada. El perfil de Firestore requiere revisar sus reglas.","warning");
        }
      } else {
        await signInWithEmailAndPassword(auth,email,password);
      }
    } catch (err) {
      const messages = {
        "auth/email-already-in-use":"Este correo ya tiene una cuenta.",
        "auth/invalid-email":"El correo no tiene un formato válido.",
        "auth/weak-password":"La contraseña debe tener al menos 6 caracteres.",
        "auth/invalid-credential":"Correo o contraseña incorrectos.",
        "auth/too-many-requests":"Demasiados intentos. Intenta más tarde.",
        "auth/network-request-failed":"No se pudo conectar. Revisa tu conexión."
      };
      error.textContent = messages[err.code] || err.message || "No fue posible completar la operación.";
      error.hidden = false;
    } finally {
      if (document.body.contains(button)) { button.disabled=false;button.innerHTML=`${register?"Crear mi cuenta":"Iniciar sesión"} <span>→</span>`; }
    }
  };
}

function shellView() {
  const user = state.user;
  const current = nav.find(n=>n[0]===state.page) || nav[0];
  root.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand"><div class="brand-mark">⚽</div><div><b>CASCARITA</b><small>FÚTBOL CON FUTURO</small></div></div>
      <div class="side-caption">PLATAFORMA DE FÚTBOL</div>
      <div class="nav-caption">MENÚ PRINCIPAL</div>
      <nav>${nav.map(([label,icon])=>`<button class="nav-item ${state.page===label?"active":""}" data-page="${label}"><span class="nav-symbol">${icon}</span>${label}${state.page===label?'<i></i>':""}</button>`).join("")}</nav>
      <div class="side-bottom">
        <div class="help-card"><b>¿Necesitas ayuda?</b><span>Estamos construyendo algo grande.</span></div>
        <div class="account-row"><div class="avatar">${esc(initials(user.displayName||user.email))}</div><div class="account-text"><b>${esc(user.displayName||"Mi cuenta")}</b><small>${esc(user.email||"")}</small></div><button id="logout" class="logout" title="Cerrar sesión">↗</button></div>
      </div>
    </aside>
    <div class="mobile-shade" id="mobile-shade"></div>
    <main class="main">
      <header class="topbar">
        <button class="mobile-menu" id="mobile-menu">☰</button>
        <div class="crumb">Plataforma <span>/</span> <b>${current[0]}</b></div>
        <div class="top-actions">
          <div class="search"><span>⌕</span><input id="search-input" placeholder="Buscar en CASCARITA..."></div>
          <button class="round-btn" id="theme-toggle" title="Cambiar tema">${state.theme==="dark"?"☀":"☾"}</button>
          <button class="round-btn bell" title="Notificaciones">♧<i></i></button>
          <div class="top-avatar">${esc(initials(user.displayName||user.email))}</div>
        </div>
      </header>
      <div class="page">
        <div class="page-heading">
          <div><div class="eyebrow green">TU ESPACIO DEPORTIVO</div><h1>${state.page==="Inicio"?'Bienvenido, <em>'+esc((user.displayName||"deportista").split(" ")[0])+'.</em>':state.page}</h1><p>${current[2]}</p></div>
          <div class="season"><i></i> TEMPORADA · EN PREPARACIÓN</div>
        </div>
        ${state.page==="Inicio"?dashboard(user):modulePage(state.page)}
        <footer class="footer"><span>© 2026 CASCARITA</span><span>DEL BARRIO A LA CANCHA. DE LA PASIÓN AL PROGRESO.</span><span>v0.1.0</span></footer>
      </div>
    </main>
  </div>`;

  root.querySelectorAll("[data-page]").forEach(btn=>btn.onclick=()=>{state.page=btn.dataset.page;shellView();});
  document.getElementById("logout").onclick=async()=>{await signOut(auth);toast("Sesión cerrada.");};
  document.getElementById("theme-toggle").onclick=()=>{setTheme(state.theme==="dark"?"light":"dark");shellView();};
  document.getElementById("mobile-menu").onclick=()=>{document.getElementById("sidebar").classList.add("open");document.getElementById("mobile-shade").classList.add("show");};
  document.getElementById("mobile-shade").onclick=()=>{document.getElementById("sidebar").classList.remove("open");document.getElementById("mobile-shade").classList.remove("show");};
}

function dashboard(user) {
  return `
  <section class="hero-banner">
    <div class="banner-content">
      <div class="banner-label">✦ UNA NUEVA FORMA DE VIVIR EL FÚTBOL</div>
      <h2>El siguiente paso<br>de tu historia <em>empieza aquí.</em></h2>
      <p>Conecta con el fútbol, desarrolla tu talento y encuentra nuevas oportunidades.</p>
      <button class="banner-cta" data-explore>Explorar plataforma <span>→</span></button>
    </div>
    <div class="pitch-art"><div class="pitch-inner"></div><div class="pitch-ball">⚽</div></div>
    <div class="banner-count">01 <span>/ 04</span></div>
  </section>
  <section class="stats">
    ${stat("♟","Jugadores","—","Perfiles por descubrir","green")}
    ${stat("⬟","Clubes","—","Clubes de la comunidad","blue")}
    ${stat("🏆","Competiciones","—","Próximamente","orange")}
    ${stat("↗","Tu actividad","0","Tu camino comienza hoy","purple")}
  </section>
  <section class="lower-grid">
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow green">TU PERFIL</div><h3>Todo comienza contigo</h3></div><span class="panel-icon">♙</span></div>
      <div class="profile-line"><div class="profile-avatar">${esc(initials(user.displayName||"C"))}</div><div><b>${esc(user.displayName||"Nuevo integrante")}</b><small>Completa tu información cuando habilitemos tu perfil deportivo.</small></div></div>
      <div class="progress"><span></span></div><div class="progress-label"><span>Cuenta creada</span><b>25%</b></div>
      <div class="success-note">✓ Tu cuenta ya forma parte de CASCARITA.</div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow green">EL CAMINO</div><h3>Lo que estamos construyendo</h3></div><span class="panel-icon">⚑</span></div>
      <div class="roadmap">
        ${road("✓","Fundación de la plataforma","Identidad, acceso y estructura inicial.",true)}
        ${road("♟","Clubes y jugadores","Perfiles, plantillas y membresías.")}
        ${road("🏆","Competiciones y partidos","Ligas, calendarios y actas.")}
        ${road("✦","Evaluación y desarrollo","Medición y evolución deportiva.")}
      </div>
    </article>
  </section>
  <section class="discover"><div class="discover-head"><div><div class="eyebrow green">DESCUBRE CASCARITA</div><h3>Un ecosistema para crecer</h3></div><span>PRÓXIMAMENTE</span></div>
    <div class="discover-grid">
      ${quick("♟","Jugadores","Talento, posiciones y evolución.")}
      ${quick("⬟","Clubes","Identidad, equipos y comunidad.")}
      ${quick("🏆","Competiciones","Ligas, calendarios y resultados.")}
      ${quick("◎","Directorio","Conecta con profesionales.")}
      ${quick("▣","Credenciales","Identidad deportiva verificable.")}
    </div>
  </section>`;
}
function stat(icon,label,value,note,tone){return `<article class="stat"><div class="stat-icon ${tone}">${icon}</div><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`;}
function road(icon,title,desc,done=false){return `<div class="road-item ${done?"done":""}"><div class="road-icon">${icon}</div><div><b>${title}</b><small>${desc}</small></div><span class="road-state">${done?"LISTO":"EN PLAN"}</span></div>`;}
function quick(icon,title,desc){return `<div class="quick-card"><span>${icon}</span><b>${title}</b><small>${desc}</small><i>→</i></div>`;}
function modulePage(page){return `<section class="module-empty"><div class="module-emblem">⚽</div><div class="eyebrow green">MÓDULO EN CONSTRUCCIÓN</div><h2>${page}</h2><p>Estamos preparando este espacio para que funcione con datos reales, permisos adecuados y herramientas deportivas completas.</p><div class="module-points"><span>✓ Seguridad desde el diseño</span><span>✓ Datos verificables</span><span>✓ Comunidad deportiva</span></div><div class="module-foot">Esta sección se habilitará en una próxima entrega de CASCARITA.</div></section>`;}

onAuthStateChanged(auth, async user => {
  state.user = user;
  if (user) {
    try {
      const ref = doc(db,"users",user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref,{displayName:user.displayName||"",email:user.email||"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      }
    } catch (e) {
      console.warn("No se pudo sincronizar el perfil de Firestore. Revisa las reglas:",e);
    }
    shellView();
  } else authView();
});

// Evita que el navegador intente restaurar el scroll a una posición extraña.
window.addEventListener("pageshow",()=>window.scrollTo(0,0));
