"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Ellipsis,
  Heart,
  Home,
  ImagePlus,
  Layers3,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import type { FormEvent } from "react";
import { useNexaStore } from "@/store/nexa-store";

const stories = [
  { name: "Tu historia", image: "photo-1534528741775-53994a69daeb", own: true },
  { name: "sofia.rios", image: "photo-1531123897727-8f129e1688ce", live: true },
  { name: "marcelo", image: "photo-1500648767791-00dcc994a43e" },
  { name: "atelier.n", image: "photo-1531058020387-3be344556be6", unseen: true },
  { name: "ines.vale", image: "photo-1534751516642-a1af1ef26a56", unseen: true },
  { name: "casa.verde", image: "photo-1441986300917-64674bd600d8", unseen: true },
];

const initialPosts = [
  {
    id: 1,
    name: "sofia.rios",
    displayName: "Sofía Ríos",
    location: "Oaxaca, México",
    avatar: "photo-1531123897727-8f129e1688ce",
    image: "photo-1518837695005-2083093ee35b",
    caption: "Hay lugares que te enseñan a bajar el ritmo. Este rincón del Pacífico se quedó conmigo. 🌊",
    likes: 2486,
    comments: 38,
    time: "hace 24 min",
    liked: false,
    saved: false,
    tags: ["viajes", "oaxaca"],
  },
  {
    id: 2,
    name: "marcelo",
    displayName: "Marcelo Vega",
    location: "Estudio / Ciudad de México",
    avatar: "photo-1500648767791-00dcc994a43e",
    image: "photo-1494438639946-1ebd1d20bf85",
    caption: "Luz de las seis, café recién hecho y una idea que por fin encuentra su forma.",
    likes: 930,
    comments: 21,
    time: "hace 1 h",
    liked: true,
    saved: false,
    tags: ["enelestudio"],
  },
];
type FeedPost = (typeof initialPosts)[number];

const trends = [
  { tag: "#ciudadlenta", posts: "2.4 mil publicaciones", category: "COMUNIDAD" },
  { tag: "Diseño consciente", posts: "En alza esta semana", category: "TEMA" },
  { tag: "#hechoamano", posts: "846 publicaciones", category: "COMUNIDAD" },
];

const imageUrl = (id: string, width = 100) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

const navigation = [
  { label: "Inicio", icon: Home },
  { label: "Descubrir", icon: Compass },
  { label: "Reels", icon: Layers3 },
  { label: "Comunidades", icon: UsersRound },
  { label: "Mensajes", icon: Send, badge: "3" },
  { label: "Notificaciones", icon: Heart, badge: "2" },
  { label: "Guardados", icon: Bookmark },
];

export default function HomeFeed() {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [following, setFollowing] = useState<string[]>([]);
  const activeFeed = useNexaStore((state) => state.activeFeed);
  const setActiveFeed = useNexaStore((state) => state.setActiveFeed);
  const queryClient = useQueryClient();
  const feedQueryKey = ["feed", activeFeed] as const;
  const { data: posts = initialPosts } = useQuery<FeedPost[]>({
    queryKey: feedQueryKey,
    queryFn: async () => initialPosts,
    initialData: initialPosts,
  });

  function togglePost(id: number, field: "liked" | "saved") {
    queryClient.setQueryData<FeedPost[]>(feedQueryKey, (current = initialPosts) =>
      current.map((post) =>
        post.id === id
          ? {
              ...post,
              [field]: !post[field],
              ...(field === "liked"
                ? { likes: post.likes + (post.liked ? -1 : 1) }
                : {}),
            }
          : post,
      ),
    );
  }

  function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    queryClient.setQueryData<FeedPost[]>(feedQueryKey, (current = initialPosts) => [
      {
        id: current.reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1,
        name: "tu.perfil",
        displayName: "Tu perfil",
        location: "Ahora",
        avatar: "photo-1534528741775-53994a69daeb",
        image: "photo-1470770841072-f978cf4d019e",
        caption: text,
        likes: 0,
        comments: 0,
        time: "ahora",
        liked: false,
        saved: false,
        tags: [],
      },
      ...current,
    ]);
    setDraft("");
    setIsComposerOpen(false);
    setNotice("Tu publicación se añadió al feed de demostración.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a aria-label="NEXA, inicio" className="brand" href="#">
          <span className="brand-mark">n</span>
          <span>nexa</span>
        </a>

        <button className="search-box" type="button" aria-label="Buscar">
          <Search size={17} />
          <span>Buscar en NEXA</span>
          <kbd>⌘ K</kbd>
        </button>

        <p className="nav-heading">ESPACIO</p>
        <nav className="main-nav" aria-label="Navegación principal">
          {navigation.map(({ label, icon: Icon, badge }) => (
            <button
              aria-current={activeFeed === label ? "page" : undefined}
              className={`nav-link ${activeFeed === label ? "active" : ""}`}
              key={label}
              onClick={() => setActiveFeed(label)}
              type="button"
            >
              <Icon size={19} strokeWidth={activeFeed === label ? 2.2 : 1.8} />
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="community-card">
          <div className="community-icon"><Sparkles size={17} /></div>
          <p>Tu espacio, tus reglas.</p>
          <span>Encuentra personas que comparten lo que te mueve.</span>
          <button type="button" onClick={() => setActiveFeed("Comunidades")}>
            Explorar comunidades <ChevronDown size={14} />
          </button>
        </div>
        <button className="profile-switcher" type="button">
          <Image src={imageUrl("photo-1534528741775-53994a69daeb", 96)} alt="" width={96} height={96} />
          <span className="profile-meta"><strong>valentina.m</strong><small>Cuenta personal</small></span>
          <Ellipsis size={19} />
        </button>
      </aside>

      <section className="feed-column">
        <header className="mobile-header">
          <a className="brand" href="#"><span className="brand-mark">n</span><span>nexa</span></a>
          <div className="mobile-actions">
            <button className="icon-button" aria-label="Buscar" type="button"><Search size={20} /></button>
            <button className="icon-button" aria-label="Notificaciones" type="button"><Heart size={20} /></button>
          </div>
        </header>

        <div className="feed-topbar">
          <div>
            <span className="eyebrow">TU ESPACIO</span>
            <h1>Un poco de inspiración.</h1>
          </div>
          <button className="icon-button settings-button" aria-label="Preferencias del feed" type="button">
            <Settings2 size={19} />
          </button>
        </div>

        <section className="stories-section" aria-label="Historias">
          <div className="section-heading">
            <h2>Círculos</h2>
            <button type="button" onClick={() => setActiveFeed("Descubrir")}>Ver todos <ChevronDown size={14} /></button>
          </div>
          <div className="stories-row">
            {stories.map((story) => (
              <button className="story" key={story.name} type="button" onClick={() => setNotice(`${story.name}: historias de demostración`)}>
                <span className={`story-ring ${story.unseen ? "unseen" : ""} ${story.own ? "own" : ""}`}>
                  <Image src={imageUrl(story.image, 120)} alt="" width={120} height={120} />
                  {story.own && <span className="story-add"><Plus size={12} /></span>}
                  {story.live && <span className="live-tag">EN VIVO</span>}
                </span>
                <span>{story.name}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="feed-tabs" role="tablist" aria-label="Tipo de feed">
          {["Para ti", "Siguiendo", "Popular"].map((tab) => (
            <button
              aria-selected={activeFeed === tab || (tab === "Para ti" && activeFeed === "Inicio")}
              className={(activeFeed === tab || (tab === "Para ti" && activeFeed === "Inicio")) ? "selected" : ""}
              key={tab}
              onClick={() => setActiveFeed(tab)}
              role="tab"
              type="button"
            >{tab}{tab === "Para ti" && <span className="sparkle-dot">✳</span>}</button>
          ))}
          <button className="feed-filter" type="button"><TrendingUp size={15} /> Relevancia <ChevronDown size={14} /></button>
        </div>

        <div className="posts-list">
          <AnimatePresence initial={false}>
            {posts.map((post) => (
              <motion.article
                animate={{ opacity: 1, y: 0 }}
                className="post-card"
                initial={{ opacity: 0, y: 12 }}
                key={post.id}
                layout
                transition={{ duration: 0.28 }}
              >
                <div className="post-header">
                  <Image className="post-avatar" src={imageUrl(post.avatar, 96)} alt="" width={96} height={96} />
                  <div className="post-author">
                    <div className="author-line"><strong>{post.name}</strong><span className="verified"><Check size={9} /></span><span className="post-time">· {post.time}</span></div>
                    <span>{post.location}</span>
                  </div>
                  <button className="icon-button more-button" type="button" aria-label="Más opciones"><Ellipsis size={20} /></button>
                </div>
                <div className="post-image-wrap">
                  <Image className="post-image" src={imageUrl(post.image, 1200)} alt={`Publicación de ${post.displayName}`} fill sizes="(max-width: 760px) 100vw, 620px" />
                  <span className="image-count"><Layers3 size={13} /> 1 / 4</span>
                </div>
                <div className="post-actions">
                  <div className="post-actions-left">
                    <button aria-label={post.liked ? "Quitar me gusta" : "Me gusta"} className={`action-button ${post.liked ? "is-liked" : ""}`} onClick={() => togglePost(post.id, "liked")} type="button"><Heart size={21} fill={post.liked ? "currentColor" : "none"} /></button>
                    <button aria-label="Comentar" className="action-button" type="button"><MessageCircle size={21} /></button>
                    <button aria-label="Compartir" className="action-button" type="button"><Send size={20} /></button>
                  </div>
                  <button aria-label={post.saved ? "Quitar de guardados" : "Guardar"} className={`action-button ${post.saved ? "is-saved" : ""}`} onClick={() => togglePost(post.id, "saved")} type="button"><Bookmark size={20} fill={post.saved ? "currentColor" : "none"} /></button>
                </div>
                <div className="post-copy">
                  <strong className="like-count">{post.likes.toLocaleString("es-MX")} <span>me gusta</span></strong>
                  <p><strong>{post.name}</strong> {post.caption}</p>
                  <button className="comments-link" type="button">Ver los {post.comments} comentarios</button>
                  <button className="comment-input" type="button" onClick={() => setNotice("Los comentarios estarán disponibles al conectar la API.")}>Añade un comentario… <Send size={14} /></button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
        <footer className="feed-footer">Estás al día <span>·</span> Vuelve pronto para descubrir algo nuevo.</footer>
      </section>

      <aside className="right-rail">
        <div className="rail-header">
          <div className="rail-greeting"><span className="eyebrow">TU ESPACIO · CDMX</span><h2>Hola, Valentina <span>✳</span></h2></div>
          <button className="avatar-button" type="button" aria-label="Tu perfil"><Image src={imageUrl("photo-1534528741775-53994a69daeb", 96)} alt="" width={96} height={96} /><span /></button>
        </div>
        <div className="rail-search"><Search size={17} /><span>Buscar personas, ideas…</span><kbd>/</kbd></div>
        <section className="rail-section suggestions">
          <div className="rail-title"><div><span className="eyebrow">BUENAS CONEXIONES</span><h3>Personas para ti</h3></div><button type="button">Ver más</button></div>
          {[
            ["ines.vale", "Inés Valdés", "Arte & vida lenta", "photo-1534751516642-a1af1ef26a56"],
            ["mateo.cooks", "Mateo Díaz", "Cocina de temporada", "photo-1506794778202-cad84cf45f1d"],
            ["estudio.norte", "Estudio Norte", "Diseño independiente", "photo-1531058020387-3be344556be6"],
          ].map(([handle, name, bio, image]) => (
            <div className="suggestion" key={handle}>
              <Image src={imageUrl(image, 96)} alt="" width={96} height={96} />
              <div className="suggestion-meta"><strong>{handle}</strong><span>{bio}</span><small>{name}</small></div>
              <button
                aria-pressed={following.includes(handle)}
                className={`follow-button ${following.includes(handle) ? "following" : ""}`}
                onClick={() => setFollowing((current) =>
                  current.includes(handle)
                    ? current.filter((item) => item !== handle)
                    : [...current, handle],
                )}
                type="button"
              >{following.includes(handle) ? "Siguiendo" : "Seguir"}</button>
            </div>
          ))}
        </section>
        <section className="trend-card">
          <div className="rail-title"><div><span className="eyebrow">LO QUE NOS MUEVE</span><h3>En conversación</h3></div><TrendingUp size={17} /></div>
          {trends.map((trend, index) => (
            <button className="trend-row" key={trend.tag} type="button" onClick={() => setActiveFeed("Descubrir")}>
              <span className="trend-number">0{index + 1}</span>
              <span className="trend-copy"><small>{trend.category}</small><strong>{trend.tag}</strong><span>{trend.posts}</span></span>
              <ChevronDown className="trend-arrow" size={15} />
            </button>
          ))}
          <button className="all-trends" type="button" onClick={() => setActiveFeed("Descubrir")}>Explorar temas <ChevronDown size={14} /></button>
        </section>
        <div className="rail-note"><MapPin size={14} /><span>Un feed más cercano a ti</span><button type="button" aria-label="Cambiar ubicación"><ChevronDown size={14} /></button></div>
        <footer className="right-footer"><a href="#">Acerca de</a><a href="#">Privacidad</a><a href="#">Normas</a><span>© 2026 NEXA</span></footer>
      </aside>

      <button className="create-button" onClick={() => setIsComposerOpen(true)} type="button"><Plus size={19} /><span>Crear</span></button>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {[Home, Compass, Plus, MessageSquareText, Heart].map((Icon, index) => (
        <button aria-label={["Inicio", "Descubrir", "Crear", "Mensajes", "Notificaciones"][index]} className={index === 0 ? "current" : ""} key={index} onClick={() => index === 2 ? setIsComposerOpen(true) : setActiveFeed(["Inicio", "Descubrir", "Crear", "Mensajes", "Notificaciones"][index])} type="button"><Icon size={21} /></button>
        ))}
      </nav>

      <AnimatePresence>
        {isComposerOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setIsComposerOpen(false); }}>
            <motion.form className="composer-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} onSubmit={createPost}>
              <div className="modal-header"><div><span className="eyebrow">CREAR ALGO</span><h2>Nueva publicación</h2></div><button className="icon-button" aria-label="Cerrar" onClick={() => setIsComposerOpen(false)} type="button"><X size={20} /></button></div>
              <textarea autoFocus maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="¿Qué te gustaría compartir?" value={draft} />
              <div className="composer-toolbar"><button className="media-add" type="button"><ImagePlus size={17} /><span>Añadir imágenes</span></button><span>{draft.length}/500</span></div>
              <button className="publish-button" disabled={!draft.trim()} type="submit">Compartir con tu círculo <Send size={15} /></button>
              <p className="demo-caption">Vista previa local: tu publicación no se guarda en el servidor.</p>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && <motion.div className="toast-message" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><Sparkles size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Cerrar aviso" type="button"><X size={14} /></button></motion.div>}
      </AnimatePresence>
    </main>
  );
}
