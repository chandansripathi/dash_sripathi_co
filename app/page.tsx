"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "overview" | "domains" | "servers" | "alerts";
type Server = {
  id: number;
  name: string;
  ip: string;
  location: string;
  status: "online" | "warning" | "offline";
  cpu: number;
  ram: number;
  temp: number;
  uptime: string;
  ping: number | null;
  os: string;
};

const domains = [
  { name: "akatsuki.ink", provider: "SpaceShip", dns: "Cloudflare", host: "Unassigned", expiry: "2027-04-17", renewal: 2500 },
  { name: "akatsuki.uk", provider: "SpaceShip", dns: "Cloudflare", host: "Unassigned", expiry: "2027-04-17", renewal: 600 },
  { name: "akatsuki.world", provider: "SpaceShip", dns: "Cloudflare", host: "Crystal Skull", expiry: "2027-05-23", renewal: 3200 },
  { name: "chandansripathi.com", provider: "SpaceShip", dns: "Cloudflare", host: "Serverbyt", expiry: "2027-05-23", renewal: 1000 },
  { name: "chandansripathi.in", provider: "SpaceShip", dns: "Cloudflare", host: "Serverbyt", expiry: "2027-04-03", renewal: 600 },
  { name: "chandansripathi.one", provider: "SpaceShip", dns: "Cloudflare", host: "Serverbyt", expiry: "2027-05-23", renewal: 2000 },
  { name: "evilincorporation.com", provider: "SpaceShip", dns: "Cloudflare", host: "Unassigned", expiry: "2027-04-17", renewal: 1000 },
  { name: "fileora.org", provider: "SpaceShip", dns: "Spaceship", host: "Unassigned", expiry: "2026-10-22", renewal: 1100 },
  { name: "ilustudios.in", provider: "SpaceShip", dns: "One.com", host: "Unassigned", expiry: "2027-04-22", renewal: 600 },
  { name: "momentsaver.in", provider: "SpaceShip", dns: "One.com", host: "Unassigned", expiry: "2027-04-17", renewal: 600 },
  { name: "mynthra.shop", provider: "SpaceShip", dns: "Hostinger", host: "Hostinger Parked", expiry: "2027-03-15", renewal: 3000 },
  { name: "offbeatcreations.in", provider: "SpaceShip", dns: "One.com", host: "Unassigned", expiry: "2027-04-17", renewal: 600 },
  { name: "sripathi.cloud", provider: "SpaceShip", dns: "Cloudflare", host: "Serverbyt", expiry: "2027-04-03", renewal: 2000 },
  { name: "sripathi.co", provider: "SpaceShip", dns: "Cloudflare", host: "Serverbyt", expiry: "2027-04-03", renewal: 3000 },
  { name: "tharunikaarts.com", provider: "SpaceShip", dns: "One.com", host: "Unassigned", expiry: "2027-04-17", renewal: 1000 },
];

const initialServers: Server[] = [];

const nav = [
  { id: "overview" as const, label: "Overview", icon: "⌂" },
  { id: "domains" as const, label: "Domains", icon: "◎" },
  { id: "servers" as const, label: "Servers", icon: "▤" },
  { id: "alerts" as const, label: "Alerts", icon: "◒" },
];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function daysUntil(date: string) {
  return Math.max(0, Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86400000));
}

function formatUptime(seconds: number) {
  if (!seconds) return "Waiting for agent";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h`;
}

function Meter({ value, tone = "blue" }: { value: number; tone?: "blue" | "purple" | "orange" }) {
  return (
    <div className={`meter ${tone}`} style={{ "--value": `${value * 3.6}deg` } as React.CSSProperties}>
      <span>{value}%</span>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [servers, setServers] = useState(initialServers);
  const [modalOpen, setModalOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("just now");

  const loadServers = useCallback(async () => {
    const response = await fetch("/api/servers", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { servers: Array<{
      id: number; name: string; ip: string; location: string; os: string; lastSeenAt: number | null;
      cpu: number; ram: number; temperature: number; uptimeSeconds: number;
    }> };
    const now = Date.now();
    setServers(payload.servers.map((server) => {
      const fresh = Boolean(server.lastSeenAt && now - server.lastSeenAt < 150000);
      const warning = fresh && (server.temperature >= 70 || server.cpu >= 90 || server.ram >= 90);
      return {
        id: server.id, name: server.name, ip: server.ip, location: server.location, os: server.os,
        status: fresh ? (warning ? "warning" : "online") : "offline",
        cpu: Math.round(server.cpu), ram: Math.round(server.ram), temp: Math.round(server.temperature),
        uptime: formatUptime(server.uptimeSeconds), ping: null,
      };
    }));
    setLastRefresh("just now");
  }, []);

  useEffect(() => {
    loadServers().catch(() => undefined);
    const timer = window.setInterval(() => loadServers().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, [loadServers]);

  const sortedDomains = useMemo(() => {
    return domains
      .map((domain) => ({ ...domain, days: daysUntil(domain.expiry) }))
      .filter((domain) => {
        const match = `${domain.name} ${domain.provider} ${domain.host} ${domain.dns}`.toLowerCase().includes(query.toLowerCase());
        const filtered = domainFilter === "all" || (domainFilter === "attention" ? domain.days < 120 : domain.dns.toLowerCase() === domainFilter);
        return match && filtered;
      })
      .sort((a, b) => a.days - b.days);
  }, [query, domainFilter]);

  const addServer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), ip: form.get("ip"), location: form.get("location"), os: form.get("os") }),
    });
    await loadServers();
    setModalOpen(false);
  };

  const refresh = async () => {
    await loadServers();
    window.setTimeout(() => setLastRefresh("a few seconds ago"), 3500);
  };

  const renewalTotal = domains.reduce((sum, domain) => sum + domain.renewal, 0);
  const onlineCount = servers.filter((server) => server.status === "online").length;
  const attentionDomains = domains.filter((domain) => daysUntil(domain.expiry) < 120).length;
  const nextDomain = [...domains].sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry))[0];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation">×</button>
        <div className="brand"><span className="brand-mark">N</span><span><strong>Nexus</strong><small>Infrastructure</small></span></div>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.id === "alerts" && <span className="nav-badge">2</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <span className="pulse-dot" />
          <div><strong>Monitoring active</strong><small>{onlineCount} agents reporting</small></div>
        </div>
        <div className="profile"><div className="avatar">KA</div><div><strong>King Alexander</strong><small>Administrator</small></div><button aria-label="Account menu">•••</button></div>
      </aside>

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation">☰</button>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search domains, servers, IPs..." /></label>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Notifications">♢<span /></button>
            <button className="primary-button" onClick={() => setModalOpen(true)}>＋ Add server</button>
          </div>
          {noticeOpen && <div className="notice-popover"><strong>Notifications</strong><p><span className="alert-dot warning" />Akatsuki Org temperature is elevated.</p><p><span className="alert-dot info" />fileora.org renews first in your portfolio.</p></div>}
        </header>

        <div className="content">
          <section className="welcome">
            <div><p className="eyebrow">Infrastructure command center</p><h1>{view === "overview" ? "Good evening, Alexander." : nav.find((item) => item.id === view)?.label}</h1><p>{view === "overview" ? "Everything important is here. Two items deserve your attention." : "Monitor and manage your infrastructure from one place."}</p></div>
            <div className="refresh"><span className="live-dot" /> Live data · {lastRefresh}<button onClick={refresh}>↻ Refresh</button></div>
          </section>

          {(view === "overview" || view === "alerts") && (
            <section className="alert-banner">
              <div className="alert-symbol">!</div>
              <div><strong>{view === "alerts" ? "2 active alerts" : "Attention needed"}</strong><p>Akatsuki Org is running warm at 72°C. {nextDomain.name} is your next domain renewal.</p></div>
              <button onClick={() => setView("alerts")}>Review alerts →</button>
            </section>
          )}

          <section className="kpi-grid">
            <article className="kpi"><div className="kpi-icon blue">◎</div><div><span>Managed domains</span><strong>{domains.length}</strong><small><b>{attentionDomains}</b> renewing within 120 days</small></div><button onClick={() => setView("domains")}>→</button></article>
            <article className="kpi"><div className="kpi-icon purple">▤</div><div><span>Servers online</span><strong>{onlineCount}<em>/{servers.length}</em></strong><small><b>{servers.length - onlineCount}</b> need attention</small></div><button onClick={() => setView("servers")}>→</button></article>
            <article className="kpi"><div className="kpi-icon green">₹</div><div><span>Annual renewals</span><strong>{inr.format(renewalTotal)}</strong><small>Across {domains.length} paid domains</small></div><button onClick={() => setView("domains")}>→</button></article>
            <article className="kpi"><div className="kpi-icon orange">◷</div><div><span>Next renewal</span><strong>{daysUntil(nextDomain.expiry)} days</strong><small>{nextDomain.name}</small></div><button onClick={() => setView("domains")}>→</button></article>
          </section>

          {(view === "overview" || view === "servers") && (
            <section className="panel server-panel">
              <div className="panel-heading"><div><h2>Server health</h2><p>Latest metrics reported by your monitoring agents</p></div><button className="text-button" onClick={() => setView("servers")}>{view === "overview" ? "View all" : "Agent setup"} →</button></div>
              <div className="server-grid">
                {servers.map((server) => (
                  <article className="server-card" key={server.id}>
                    <div className="server-title"><span className={`server-status ${server.status}`} /><div><h3>{server.name}</h3><p>{server.ip} · {server.location}</p></div><button aria-label={`More options for ${server.name}`}>•••</button></div>
                    <div className="metrics"><div><Meter value={server.cpu} /><small>CPU</small></div><div><Meter value={server.ram} tone="purple" /><small>RAM</small></div><div><Meter value={server.temp} tone="orange" /><small>TEMP</small></div></div>
                    <div className="server-meta"><span>Uptime <b>{server.uptime}</b></span><span>Ping <b>{server.ping ? `${server.ping} ms` : "Private"}</b></span><span>OS <b>{server.os}</b></span></div>
                  </article>
                ))}
                {(view === "servers" || servers.length === 0) && <button className="add-server-card" onClick={() => setModalOpen(true)}><span>＋</span><strong>{servers.length ? "Add another server" : "Connect your first server"}</strong><small>Install the lightweight agent after adding it</small></button>}
              </div>
            </section>
          )}

          {(view === "overview" || view === "domains") && (
            <section className="panel domain-panel">
              <div className="panel-heading"><div><h2>{view === "overview" ? "Upcoming renewals" : "Domain portfolio"}</h2><p>{view === "overview" ? "Sorted by the nearest expiry date" : `${sortedDomains.length} domains · ${inr.format(renewalTotal)} annual renewal value`}</p></div>
                {view === "overview" ? <button className="text-button" onClick={() => setView("domains")}>View all →</button> : <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} aria-label="Filter domains"><option value="all">All providers</option><option value="attention">Needs attention</option><option value="cloudflare">Cloudflare DNS</option><option value="one.com">One.com DNS</option></select>}
              </div>
              <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Provider</th><th>Hosting</th><th>Expires</th><th>Time left</th><th>Renewal</th><th /></tr></thead><tbody>
                {sortedDomains.slice(0, view === "overview" ? 5 : sortedDomains.length).map((domain) => (
                  <tr key={domain.name}><td><span className="domain-icon">◎</span><div><strong>{domain.name}</strong><small>{domain.dns} DNS</small></div></td><td>{domain.provider}</td><td>{domain.host}</td><td>{dateFmt.format(new Date(`${domain.expiry}T00:00:00`))}</td><td><span className={`days-pill ${domain.days < 120 ? "urgent" : domain.days < 240 ? "soon" : "safe"}`}>{domain.days} days</span></td><td><strong>{inr.format(domain.renewal)}</strong></td><td><button aria-label={`Options for ${domain.name}`}>•••</button></td></tr>
                ))}
              </tbody></table></div>
              {sortedDomains.length === 0 && <div className="empty-state">No domains match that search.</div>}
            </section>
          )}

          {view === "alerts" && <section className="panel alerts-list"><article><span className="alert-symbol">!</span><div><strong>High server temperature</strong><p>Akatsuki Org reported 72°C. Check airflow and active workloads.</p><small>Active now · Warning</small></div><button>Mark resolved</button></article><article><span className="alert-symbol info-symbol">i</span><div><strong>Upcoming domain renewal</strong><p>fileora.org renews on 22 Oct 2026 for {inr.format(1100)}.</p><small>79 days remaining · Information</small></div><button>Remind me later</button></article></section>}

          <footer><span>Nexus Infrastructure · Data imported from Master Domains</span><span>Agent API ready for connection</span></footer>
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-server-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button><p className="eyebrow">New monitoring target</p><h2 id="add-server-title">Add a server</h2><p>Save the server first, then install the Nexus agent to begin reporting live metrics.</p><form onSubmit={addServer}><label>Server name<input name="name" required placeholder="e.g. Web Production" /></label><label>IP address<input name="ip" required placeholder="203.0.113.10" /></label><div className="form-row"><label>Location<input name="location" placeholder="Mumbai, IN" /></label><label>Operating system<select name="os"><option>Ubuntu 24.04</option><option>Ubuntu 22.04</option><option>Debian 12</option><option>Rocky Linux 9</option><option>Windows Server</option></select></label></div><div className="modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" type="submit">Add server</button></div></form></div></div>}
    </div>
  );
}
