"use client";
import { FormEvent, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({ setup, branding }: { setup?: boolean; branding: Record<string, string | number | null> }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Unable to continue"); setBusy(false); return; }
    router.push("/"); router.refresh();
  }
  const style = { "--primary": String(branding.primary_color || "#2563eb"), "--accent": String(branding.accent_color || "#7c3aed"), "--font": String(branding.font_family || "Inter"), "--base-size": `${branding.base_font_size || 15}px`, backgroundImage: branding.login_background_path ? `linear-gradient(120deg,rgba(5,10,24,.86),rgba(5,10,24,.5)),url(${branding.login_background_path})` : undefined } as CSSProperties;
  return <main className="auth-page" style={style}>
    <section className="auth-card">
      {branding.login_logo_path ? <img className="login-logo" src={String(branding.login_logo_path)} alt="" /> : <div className="auth-mark">N</div>}
      <p className="eyebrow">{setup ? "First-run setup" : branding.brand_tagline}</p>
      <h1>{setup ? `Create your ${branding.brand_name} administrator` : `Welcome to ${branding.brand_name}`}</h1>
      <p>{setup ? "This account has full control. Two-factor authentication can be added later." : "Sign in to your infrastructure command center."}</p>
      <form onSubmit={submit}>
        {setup && <label>Full name<input name="name" autoComplete="name" required placeholder="King Alexander" /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 12 : undefined} required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button wide" disabled={busy}>{busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}</button>
      </form>
    </section>
  </main>;
}
