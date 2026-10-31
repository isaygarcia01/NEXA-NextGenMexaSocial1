"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, type NexaUser } from "@/lib/api";
import { useNexaStore } from "@/store/nexa-store";

type AuthMode = "login" | "register" | "forgot" | "reset";

export function AuthScreen({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setAuth = useNexaStore((state) => state.setAuth);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;
    if (window.location.pathname === "/verify-email") {
      void apiRequest<{ verified: true }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      }).then(() => setMessage("Correo verificado. Ya puedes iniciar sesión."))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo verificar el correo."));
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        const result = await apiRequest<{ accessToken: string; user: NexaUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setAuth(result.accessToken, result.user);
      } else if (mode === "register") {
        await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, username, displayName, password }),
        });
        setMessage("Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesión.");
        setMode("login");
      } else if (mode === "forgot") {
        await apiRequest("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage("Si la cuenta existe, recibirás un enlace para restablecer la contraseña.");
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("El enlace de restablecimiento no es válido.");
        await apiRequest("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
        setMode("login");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Vuelve a tu espacio."
    : mode === "register" ? "Crea tu espacio."
      : mode === "forgot" ? "Recupera el acceso."
        : "Elige una nueva contraseña.";

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link aria-label="NEXA, inicio" className="brand auth-brand" href="/">
          <span className="brand-mark">n</span><span>nexa</span>
        </Link>
        <span className="eyebrow">TU ESPACIO, A TU MANERA</span>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-intro">Descubre ideas, comparte lo que te mueve y encuentra tu comunidad.</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <>
            <label htmlFor="display-name">Nombre</label>
            <input id="display-name" autoComplete="name" maxLength={80} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
            <label htmlFor="username">Nombre de usuario</label>
            <input id="username" autoComplete="username" maxLength={30} minLength={3} onChange={(event) => setUsername(event.target.value)} pattern="[a-zA-Z0-9._]{3,30}" required value={username} />
          </>}
          {mode !== "reset" && <>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </>}
          {(mode === "login" || mode === "register" || mode === "reset") && <>
            <label htmlFor="password">{mode === "reset" ? "Nueva contraseña" : "Contraseña"}</label>
            <input id="password" autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </>}
          {error && <p className="auth-alert error" role="alert">{error}</p>}
          {message && <p className="auth-alert success" role="status">{message}</p>}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? "Un momento…" : mode === "login" ? "Iniciar sesión" : mode === "register" ? "Crear cuenta" : mode === "forgot" ? "Enviar enlace" : "Actualizar contraseña"}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" && <>
            <button type="button" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</button>
            <span>¿Primera vez aquí? <button type="button" onClick={() => setMode("register")}>Crear cuenta</button></span>
          </>}
          {mode !== "login" && <button type="button" onClick={() => { setError(""); setMessage(""); setMode("login"); }}>Volver al inicio de sesión</button>}
        </div>
      </section>
    </main>
  );
}
