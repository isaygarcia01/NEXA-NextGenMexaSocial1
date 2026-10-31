"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
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
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNexaStore } from "@/store/nexa-store";
import { apiRequest, refreshAccessToken } from "@/lib/api";
import { AuthScreen } from "@/components/auth-screen";

const stories = [
  { name: "Tu historia", image: "photo-1534528741775-53994a69daeb", own: true },
  { name: "sofia.rios", image: "photo-1531123897727-8f129e1688ce", live: true },
  { name: "marcelo", image: "photo-1500648767791-00dcc994a43e" },
  { name: "atelier.n", image: "photo-1531058020387-3be344556be6", unseen: true },
  { name: "ines.vale", image: "photo-1534751516642-a1af1ef26a56", unseen: true },
  { name: "casa.verde", image: "photo-1441986300917-64674bd600d8", unseen: true },
];
const suggestedPeople = [
  ["sofia.rios", "Sofía Ríos", "Fotografía & viajes lentos", "photo-1534751516642-a1af1ef26a56"],
  ["marcelo", "Marcelo Vega", "Diseño independiente", "photo-1500648767791-00dcc994a43e"],
] as const;

type FeedPost = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  publishedAt: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  mediaUrl: string | null;
};
type UserProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  isPrivate: boolean;
};

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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ displayName: "", bio: "", location: "", websiteUrl: "", isPrivate: false });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const activeFeed = useNexaStore((state) => state.activeFeed);
  const setActiveFeed = useNexaStore((state) => state.setActiveFeed);
  const accessToken = useNexaStore((state) => state.accessToken);
  const user = useNexaStore((state) => state.user);
  const setAuth = useNexaStore((state) => state.setAuth);
  const clearAuth = useNexaStore((state) => state.clearAuth);
  const queryClient = useQueryClient();
  const authAttempted = useRef(false);
  const feedQueryKey = ["feed", activeFeed] as const;
  useEffect(() => {
    if (authAttempted.current) return;
    authAttempted.current = true;
    void refreshAccessToken()
      .then((result) => setAuth(result.accessToken, result.user))
      .catch(() => clearAuth())
      .finally(() => setAuthLoading(false));
  }, [clearAuth, setAuth]);

  const { data: feed, isLoading: postsLoading, isError: feedError, refetch } = useQuery<{ items: FeedPost[] }>({
    queryKey: feedQueryKey,
    queryFn: async () => {
      if (activeFeed === "Guardados") {
        const bookmarks = await apiRequest<Omit<FeedPost, "avatarUrl" | "commentCount" | "liked" | "bookmarked">[]>(
          "/bookmarks",
          {},
          accessToken,
        );
        return {
          items: bookmarks.map((post) => ({
            ...post,
            avatarUrl: null,
            commentCount: 0,
            liked: false,
            bookmarked: true,
          })),
        };
      }
      return apiRequest(
        `/posts?limit=25${activeFeed === "Siguiendo" ? "&feed=following" : ""}`,
        {},
        accessToken,
      );
    },
    enabled: Boolean(accessToken),
  });
  const suggestionProfiles = useQueries({
    queries: suggestedPeople.map(([handle]) => ({
      queryKey: ["profile", handle],
      queryFn: () => apiRequest<{ viewerFollows: boolean }>(`/users/${handle}`, {}, accessToken),
      enabled: Boolean(accessToken),
    })),
  });
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["profile", "me"],
    queryFn: () => apiRequest("/profiles/me", {}, accessToken),
    enabled: Boolean(accessToken),
  });
  const commentsQuery = useQuery<{ id: string; body: string; username: string }[]>({
    queryKey: ["comments", commentPostId],
    queryFn: () => apiRequest(`/posts/${commentPostId}/comments`, {}, accessToken),
    enabled: Boolean(commentPostId && accessToken),
  });
  const sessionsQuery = useQuery<{
    id: string;
    isCurrent: boolean;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    lastSeenAt: string | null;
  }[]>({
    queryKey: ["sessions"],
    queryFn: () => apiRequest("/auth/sessions", {}, accessToken),
    enabled: Boolean(accessToken && sessionsOpen),
  });
  const posts = feed?.items ?? [];

  async function togglePost(post: FeedPost, field: "liked" | "saved") {
    try {
      await apiRequest(
        field === "liked" ? `/posts/${post.id}/like` : `/posts/${post.id}/bookmark`,
        { method: "POST" },
        accessToken,
      );
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      setNotice(field === "liked" ? "Me gusta actualizado." : "Guardado actualizado.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo actualizar la publicación.");
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !accessToken) return;
    try {
      let mediaId: string | undefined;
      if (selectedImage) {
        const formData = new FormData();
        formData.append("file", selectedImage);
        const media = await apiRequest<{ id: string }>("/media/images", {
          method: "POST",
          body: formData,
        }, accessToken);
        mediaId = media.id;
      }
      await apiRequest("/posts", {
        method: "POST",
        body: JSON.stringify({ body: text, ...(mediaId ? { mediaId } : {}) }),
      }, accessToken);
      setDraft("");
      setSelectedImage(null);
      setIsComposerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      setNotice("Tu publicación ya está en NEXA.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo publicar.");
    }
  }

  async function createComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentPostId || !commentDraft.trim() || !accessToken) return;
    try {
      await apiRequest(`/posts/${commentPostId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentDraft.trim() }),
      }, accessToken);
      setCommentDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comments", commentPostId] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
      ]);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo añadir el comentario.");
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    try {
      let avatarMediaId: string | undefined;
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        const media = await apiRequest<{ id: string }>("/media/images", {
          method: "POST",
          body: formData,
        }, accessToken);
        avatarMediaId = media.id;
      }
      await apiRequest("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...profileDraft,
          websiteUrl: profileDraft.websiteUrl || undefined,
          ...(avatarMediaId ? { avatarMediaId } : {}),
        }),
      }, accessToken);
      setAvatarFile(null);
      setProfileEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setNotice("Perfil actualizado.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo actualizar el perfil.");
    }
  }

  async function logout() {
    if (!accessToken) return;
    try {
      await apiRequest("/auth/logout", { method: "POST" }, accessToken);
      clearAuth();
      queryClient.clear();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo cerrar la sesión.");
    }
  }

  if (authLoading) {
    return <main className="auth-page" aria-busy="true"><p className="eyebrow">CARGANDO TU ESPACIO…</p></main>;
  }
  if (!accessToken) return <AuthScreen />;

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
        <button className="profile-switcher" onClick={() => {
          setProfileDraft({
            displayName: profile?.displayName ?? "",
            bio: profile?.bio ?? "",
            location: profile?.location ?? "",
            websiteUrl: profile?.websiteUrl ?? "",
            isPrivate: profile?.isPrivate ?? false,
          });
          setProfileEditorOpen(true);
        }} type="button" aria-label="Editar perfil">
          <Image src={profile?.avatarUrl ?? imageUrl("photo-1534528741775-53994a69daeb", 96)} alt="" width={96} height={96} unoptimized />
          <span className="profile-meta"><strong>{profile?.username ?? user?.username}</strong><small>Editar perfil</small></span>
          <Settings2 size={17} />
        </button>
        <div className="account-actions">
          <button type="button" onClick={() => setSessionsOpen(true)}>Sesiones activas</button>
          <button type="button" onClick={() => void logout()}>Cerrar sesión</button>
        </div>
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
            <h1>{activeFeed === "Siguiendo" ? "Cerca de tu círculo." : "Un poco de inspiración."}</h1>
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
          {["Para ti", "Siguiendo"].map((tab) => (
            <button
              aria-selected={activeFeed === tab || (tab === "Para ti" && activeFeed === "Inicio")}
              className={(activeFeed === tab || (tab === "Para ti" && activeFeed === "Inicio")) ? "selected" : ""}
              key={tab}
              onClick={() => setActiveFeed(tab === "Siguiendo" ? "Siguiendo" : "Inicio")}
              role="tab"
              type="button"
            >{tab}{tab === "Para ti" && <span className="sparkle-dot">✳</span>}</button>
          ))}
          <button className="feed-filter" type="button"><TrendingUp size={15} /> Relevancia <ChevronDown size={14} /></button>
        </div>

        <div className="posts-list">
          <AnimatePresence initial={false}>
            {postsLoading && <div className="empty-feed" aria-live="polite">Cargando publicaciones…</div>}
            {feedError && <div className="empty-feed" role="alert">No se pudo cargar el feed. <button type="button" onClick={() => void refetch()}>Reintentar</button></div>}
            {!postsLoading && !feedError && posts.length === 0 && <div className="empty-feed"><strong>Tu feed empieza aquí.</strong><span>Cuando tu círculo comparta algo, aparecerá en este espacio.</span></div>}
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
                  <Image className="post-avatar" src={post.avatarUrl ?? imageUrl("photo-1534528741775-53994a69daeb", 96)} alt="" width={96} height={96} unoptimized />
                  <div className="post-author">
                    <div className="author-line"><strong>{post.username}</strong><span className="post-time">· {new Date(post.publishedAt).toLocaleDateString("es-MX")}</span></div>
                    <span>{post.displayName}</span>
                  </div>
                  <button className="icon-button more-button" type="button" aria-label="Más opciones"><Ellipsis size={20} /></button>
                </div>
                {post.mediaUrl && <div className="post-image-wrap"><Image className="post-image" src={post.mediaUrl} alt={`Publicación de ${post.displayName}`} fill sizes="(max-width: 760px) 100vw, 620px" unoptimized /></div>}
                <div className="post-actions">
                  <div className="post-actions-left">
                    <button aria-label={post.liked ? "Quitar me gusta" : "Me gusta"} className={`action-button ${post.liked ? "is-liked" : ""}`} onClick={() => void togglePost(post, "liked")} type="button"><Heart size={21} fill={post.liked ? "currentColor" : "none"} /></button>
                    <button aria-label="Comentar" className="action-button" onClick={() => setCommentPostId(commentPostId === post.id ? null : post.id)} type="button"><MessageCircle size={21} /></button>
                    <button aria-label="Compartir" className="action-button" type="button"><Send size={20} /></button>
                  </div>
                  <button aria-label={post.bookmarked ? "Quitar de guardados" : "Guardar"} className={`action-button ${post.bookmarked ? "is-saved" : ""}`} onClick={() => void togglePost(post, "saved")} type="button"><Bookmark size={20} fill={post.bookmarked ? "currentColor" : "none"} /></button>
                </div>
                <div className="post-copy">
                  <strong className="like-count">{post.likeCount.toLocaleString("es-MX")} <span>me gusta</span></strong>
                  <p><strong>{post.username}</strong> {post.body}</p>
                  <button className="comments-link" onClick={() => setCommentPostId(commentPostId === post.id ? null : post.id)} type="button">Ver los {post.commentCount} comentarios</button>
                  {commentPostId === post.id && <div className="comments-panel">
                    {commentsQuery.isLoading ? <span>Cargando comentarios…</span> : commentsQuery.data?.map((comment) => <p key={comment.id}><strong>{comment.username}</strong> {comment.body}</p>)}
                    <form onSubmit={createComment}><label className="sr-only" htmlFor={`comment-${post.id}`}>Escribe un comentario</label><input id={`comment-${post.id}`} maxLength={2000} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Añade un comentario…" value={commentDraft} /><button aria-label="Enviar comentario" disabled={!commentDraft.trim()} type="submit"><Send size={14} /></button></form>
                  </div>}
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
        <footer className="feed-footer">Estás al día <span>·</span> Vuelve pronto para descubrir algo nuevo.</footer>
      </section>

      <aside className="right-rail">
        <div className="rail-header">
          <div className="rail-greeting"><span className="eyebrow">TU ESPACIO</span><h2>Hola, {profile?.displayName?.split(" ")[0] ?? user?.username} <span>✳</span></h2></div>
          <button className="avatar-button" onClick={() => {
            setProfileDraft({
              displayName: profile?.displayName ?? "",
              bio: profile?.bio ?? "",
              location: profile?.location ?? "",
              websiteUrl: profile?.websiteUrl ?? "",
              isPrivate: profile?.isPrivate ?? false,
            });
            setProfileEditorOpen(true);
          }} type="button" aria-label="Editar perfil"><Image src={profile?.avatarUrl ?? imageUrl("photo-1534528741775-53994a69daeb", 96)} alt="" width={96} height={96} unoptimized /><span /></button>
        </div>
        <div className="rail-search"><Search size={17} /><span>Buscar personas, ideas…</span><kbd>/</kbd></div>
        <section className="rail-section suggestions">
          <div className="rail-title"><div><span className="eyebrow">BUENAS CONEXIONES</span><h3>Personas para ti</h3></div><button type="button">Ver más</button></div>
          {suggestedPeople.map(([handle, name, bio, image], index) => (
            <div className="suggestion" key={handle}>
              <Image src={imageUrl(image, 96)} alt="" width={96} height={96} />
              <div className="suggestion-meta"><strong>{handle}</strong><span>{bio}</span><small>{name}</small></div>
              <button
                aria-pressed={Boolean(suggestionProfiles[index]?.data?.viewerFollows)}
                className={`follow-button ${suggestionProfiles[index]?.data?.viewerFollows ? "following" : ""}`}
                disabled={!suggestionProfiles[index]?.data}
                onClick={async () => {
                  try {
                    const followed = suggestionProfiles[index]?.data?.viewerFollows;
                    await apiRequest(`/users/${handle}/follow`, { method: followed ? "DELETE" : "POST" }, accessToken);
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["profile", handle] }),
                      queryClient.invalidateQueries({ queryKey: ["feed"] }),
                    ]);
                  } catch (reason) {
                    setNotice(reason instanceof Error ? reason.message : "No se pudo actualizar el seguimiento.");
                  }
                }}
                type="button"
              >{suggestionProfiles[index]?.data?.viewerFollows ? "Siguiendo" : "Seguir"}</button>
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
        {profileEditorOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileEditorOpen(false); }}>
            <motion.form className="composer-modal settings-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} onSubmit={updateProfile}>
              <div className="modal-header"><div><span className="eyebrow">TU CUENTA</span><h2>Editar perfil</h2></div><button className="icon-button" aria-label="Cerrar" onClick={() => setProfileEditorOpen(false)} type="button"><X size={20} /></button></div>
              <label htmlFor="profile-display-name">Nombre</label>
              <input id="profile-display-name" maxLength={80} onChange={(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} required value={profileDraft.displayName} />
              <label htmlFor="profile-bio">Biografía</label>
              <textarea id="profile-bio" maxLength={500} onChange={(event) => setProfileDraft({ ...profileDraft, bio: event.target.value })} value={profileDraft.bio} />
              <label htmlFor="profile-location">Ubicación</label>
              <input id="profile-location" maxLength={120} onChange={(event) => setProfileDraft({ ...profileDraft, location: event.target.value })} value={profileDraft.location} />
              <label htmlFor="profile-website">Sitio web</label>
              <input id="profile-website" onChange={(event) => setProfileDraft({ ...profileDraft, websiteUrl: event.target.value })} type="url" value={profileDraft.websiteUrl} />
              <label className="profile-image-select" htmlFor="profile-image"><ImagePlus size={16} />{avatarFile?.name ?? "Cambiar foto de perfil"}</label>
              <input accept="image/jpeg,image/png,image/webp" className="sr-only" id="profile-image" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} type="file" />
              <label className="privacy-toggle"><input checked={profileDraft.isPrivate} onChange={(event) => setProfileDraft({ ...profileDraft, isPrivate: event.target.checked })} type="checkbox" /><span>Cuenta privada</span></label>
              <button className="publish-button" type="submit">Guardar perfil</button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sessionsOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setSessionsOpen(false); }}>
            <motion.section aria-labelledby="sessions-title" aria-modal="true" className="composer-modal sessions-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} role="dialog">
              <div className="modal-header"><div><span className="eyebrow">SEGURIDAD</span><h2 id="sessions-title">Sesiones activas</h2></div><button className="icon-button" aria-label="Cerrar" onClick={() => setSessionsOpen(false)} type="button"><X size={20} /></button></div>
              {sessionsQuery.isLoading && <p>Cargando dispositivos…</p>}
              {sessionsQuery.isError && <p className="auth-alert error" role="alert">No se pudieron cargar las sesiones.</p>}
              {sessionsQuery.data?.map((session) => (
                <article className="session-row" key={session.id}>
                  <div><strong>{session.userAgent ?? "Dispositivo"}</strong><span>{session.ipAddress ?? "IP no disponible"} · {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString("es-MX") : "Sin actividad"}</span></div>
                  {session.isCurrent
                    ? <span className="current-session">Este dispositivo</span>
                    : <button type="button" onClick={async () => {
                      try {
                        await apiRequest(`/auth/sessions/${session.id}`, { method: "DELETE" }, accessToken);
                        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
                      } catch (reason) {
                        setNotice(reason instanceof Error ? reason.message : "No se pudo cerrar la sesión.");
                      }
                    }}>Cerrar</button>}
                </article>
              ))}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isComposerOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setIsComposerOpen(false); }}>
            <motion.form className="composer-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} onSubmit={createPost}>
              <div className="modal-header"><div><span className="eyebrow">CREAR ALGO</span><h2>Nueva publicación</h2></div><button className="icon-button" aria-label="Cerrar" onClick={() => setIsComposerOpen(false)} type="button"><X size={20} /></button></div>
              <textarea autoFocus maxLength={5000} onChange={(event) => setDraft(event.target.value)} placeholder="¿Qué te gustaría compartir?" value={draft} />
              <div className="composer-toolbar"><input aria-label="Seleccionar imagen" accept="image/jpeg,image/png,image/webp" className="sr-only" id="post-image" onChange={(event) => setSelectedImage(event.target.files?.[0] ?? null)} type="file" /><button className="media-add" onClick={() => document.getElementById("post-image")?.click()} type="button"><ImagePlus size={17} /><span>{selectedImage?.name ?? "Añadir imagen"}</span></button><span>{draft.length}/5000</span></div>
              <button className="publish-button" disabled={!draft.trim()} type="submit">Compartir con tu círculo <Send size={15} /></button>
              {selectedImage && <p className="demo-caption">La imagen se optimizará y almacenará de forma segura.</p>}
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
