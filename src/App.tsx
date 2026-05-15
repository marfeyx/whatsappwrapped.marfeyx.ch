import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { calculateWrappedStats, getAllParticipants, getRollingYearWindow, mergeChats } from "./stats";
import { AccountProfile } from "./accountProfile";
import type { ParsedChat, ParticipantStats, WrappedStats } from "./types";

type AuthMode = "login" | "register";

const maxAuthAttempts = 5;
const authLockoutMs = 60 * 1000;
const maxAuthSubmissions = 5;
const authRateLimitWindowMs = 60 * 1000;
const mobileBreakpoint = 860;

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authFailures, setAuthFailures] = useState(0);
  const [authLockedUntil, setAuthLockedUntil] = useState<number | null>(null);
  const [authRateLimitedUntil, setAuthRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < mobileBreakpoint);
  const [chats, setChats] = useState<ParsedChat[]>([]);
  const [selfAliases, setSelfAliases] = useState<Set<string>>(() => new Set());
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const authSubmissionTimes = useRef<number[]>([]);

  const authNow = now;
  const isAuthLocked = Boolean(authLockedUntil && authLockedUntil > authNow);
  const isAuthRateLimited = Boolean(authRateLimitedUntil && authRateLimitedUntil > authNow);
  const isAuthBlocked = isAuthLocked || isAuthRateLimited;
  const authBlockSeconds = Math.max(
    authLockedUntil ? Math.ceil((authLockedUntil - authNow) / 1000) : 0,
    authRateLimitedUntil ? Math.ceil((authRateLimitedUntil - authNow) / 1000) : 0,
  );
  const participants = useMemo(() => getAllParticipants(chats), [chats]);
  const stats = useMemo(() => calculateWrappedStats(chats, selfAliases, new Date()), [chats, selfAliases]);
  const windowLabel = `${formatDate(stats.windowStart)} - ${formatDate(stats.windowEnd)}`;
  const hasAliases = selfAliases.size > 0;

  useEffect(() => {
    document.title = "Whatsapp Wrapped";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let isMounted = true;
      if (!isMounted) return;
      setAuthUser(data.user);
      setIsAuthReady(true);
      setIsAuthModalOpen(!data.user);
    });

    const {
      data: { subscription },
      setAuthUser(session?.user ?? null);
      setIsAuthReady(true);
      setIsAuthModalOpen(!session?.user);
      if (!session?.user) clearImportedChats();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSelfAliases((current) => new Set([...current].filter((alias) => participants.includes(alias))));
  }, [participants]);

  function openFilePicker() {
    if (!authUser) {
      setAuthError("");
      setIsAuthModalOpen(true);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    if (!authUser) {
      setIsAuthModalOpen(true);
      return;
    }

    const zipFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".zip"));
    const rejected = selected.length - zipFiles.length;
    const { windowStart, windowEnd } = getRollingYearWindow(new Date());

    setIsImporting(true);
    setImportStatus(`Reading ${zipFiles.length.toLocaleString()} ZIP file${zipFiles.length === 1 ? "" : "s"} locally...`);
    setImportErrors(rejected ? [`${rejected} non-ZIP file${rejected === 1 ? "" : "s"} skipped.`] : []);

    try {
      const { parseWhatsAppFiles } = await import("./parser");
      const result = await parseWhatsAppFiles(zipFiles, windowStart, windowEnd);
      setChats((current) => mergeChats(current, result.chats));
      setImportErrors((current) => [...current, ...result.errors]);
      setImportStatus(
        result.chats.length
          ? `Imported ${result.chats.length.toLocaleString()} chat export${result.chats.length === 1 ? "" : "s"}.`
          : "No chat exports were imported.",
      );
    } catch {
      setImportErrors((current) => [...current, "Unexpected import failure. Try a smaller batch."]);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAuthBlocked) {
      setAuthError(`Too many attempts. Try again in ${authBlockSeconds} seconds.`);
      return;
    }

    const email = authEmail.trim().toLowerCase();
    const displayName = authDisplayName.trim();
    const validationError = validateCredentials(email, authPassword, authMode === "register" ? displayName : undefined);
    if (validationError) {
      setAuthError(validationError);
      return;
    }

    const rateLimitError = registerAuthSubmission();
    if (rateLimitError) {
      setAuthError(rateLimitError);
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");

    try {
      const result =
        authMode === "login"
              email,
              password: authPassword,
              options: { data: { display_name: displayName } },
            });

      if (result.error) {
        if (shouldCountAuthFailure(result.error, authMode)) registerAuthFailure();
        setAuthError(getAuthErrorMessage(result.error, authMode));
        return;
      }

      setAuthFailures(0);
      setAuthLockedUntil(null);
      setAuthPassword("");
      setIsAuthModalOpen(false);

      if (authMode === "register" && !result.data.session) {
        setAuthError("Check your email to confirm your account before signing in.");
        setAuthMode("login");
        setIsAuthModalOpen(true);
      }
    } catch {
    } finally {
      setIsAuthenticating(false);
    }
  }

  function registerAuthSubmission() {
    const cutoff = Date.now() - authRateLimitWindowMs;
    authSubmissionTimes.current = authSubmissionTimes.current.filter((time) => time > cutoff);
    if (authSubmissionTimes.current.length >= maxAuthSubmissions) {
      setAuthRateLimitedUntil(Date.now() + authRateLimitWindowMs);
      return "Too many login attempts. Try again in 60 seconds.";
    }
    authSubmissionTimes.current.push(Date.now());
    return "";
  }

  function registerAuthFailure() {
    const nextFailures = authFailures + 1;
    setAuthFailures(nextFailures);
    if (nextFailures >= maxAuthAttempts) {
      setAuthLockedUntil(Date.now() + authLockoutMs);
      setAuthFailures(0);
    }
  }

  function toggleAlias(name: string) {
    setSelfAliases((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clearImportedChats() {
    setChats([]);
    setSelfAliases(new Set());
    setImportErrors([]);
    setImportStatus("");
  }

    clearImportedChats();
  }

  if (isMobile) {
    return <DesktopOnly />;
  }

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">Whatsapp Wrapped</p>
          <h1>Your chat year, computed privately.</h1>
          <p className="lede">Upload WhatsApp export ZIPs. Stats are calculated in this browser for {windowLabel}.</p>
        </div>

        <AccountProfile
          compact
          className="auth-status"
          user={authUser}
          isAuthReady={isAuthReady}
          onSignOut={signOut}
          onLogin={() => setIsAuthModalOpen(true)}
        />

        <button className="file-drop" disabled={!authUser || isImporting} onClick={openFilePicker}>
          <span className="file-icon">+</span>
          <strong>{isImporting ? "Importing locally..." : "Choose WhatsApp ZIP exports"}</strong>
          <small>Multiple files allowed. Nothing is uploaded or saved.</small>
        </button>
        <input className="hidden-file-input" multiple accept=".zip,application/zip" type="file" ref={fileInputRef} onChange={handleFileChange} />

        {importStatus && <div className="notice">{importStatus}</div>}
        {importErrors.map((error) => (
          <div className="error-message" key={error}>
            {error}
          </div>
        ))}

        <section className="panel-block">
          <h2>Identity</h2>
          <p className="muted">Mark every sender name that represents you.</p>
          <div className="alias-list">
            {participants.length ? (
              participants.map((participant) => (
                <label className="alias-pill" key={participant}>
                  <input checked={selfAliases.has(participant)} type="checkbox" onChange={() => toggleAlias(participant)} />
                  <span>{participant}</span>
                </label>
              ))
            ) : (
              <p className="empty">Upload exports to detect senders.</p>
            )}
          </div>
        </section>

        <section className="panel-block compact-stats">
          <MiniStat label="Chats" value={stats.chats} />
          <MiniStat label="Messages" value={stats.messages} />
          <MiniStat label="Active days" value={stats.activeDays} />
        </section>
      </aside>

      <section className="story-panel">
        <div className="story-header">
          <p className="eyebrow">Rolling 365 days</p>
          <h2>{stats.messages ? "Your Whatsapp Wrapped" : "Import chats to start"}</h2>
          <p>{stats.messages ? `${stats.messages.toLocaleString()} messages across ${stats.chats.toLocaleString()} exports.` : "The dashboard unlocks after your first successful import."}</p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Total messages" value={stats.messages} />
          <MetricCard label="Your messages" value={hasAliases ? stats.yourMessages : "Select aliases"} />
          <MetricCard label="Voice memos" value={stats.voiceMemos} />
          <MetricCard label="Media files" value={stats.images + stats.videos + stats.audio + stats.documents} />
        </div>

        <LazySection className="wrapped-section" minHeight={260}>
          <SectionTitle eyebrow="Pulse" title="When the chat came alive" />
          <div className="split-grid">
            <Highlight label="Busiest day" value={stats.busiestDay ? formatReadableDay(stats.busiestDay.label) : "None"} detail={`${stats.busiestDay?.count.toLocaleString() ?? "0"} messages`} />
            <Highlight label="Busiest hour" value={stats.busiestHour ? `${String(stats.busiestHour.hour).padStart(2, "0")}:00` : "None"} detail={`${stats.busiestHour?.count.toLocaleString() ?? "0"} messages`} />
          </div>
          <HourBars stats={stats} />
        </LazySection>

        <LazySection className="wrapped-section" minHeight={300}>
          <SectionTitle eyebrow="People" title="Who kept it going" />
          {!hasAliases && <div className="notice">Choose your aliases on the left to separate your stats from partners.</div>}
          <ParticipantTable participants={stats.participantStats} />
        </LazySection>

        <LazySection className="wrapped-section" minHeight={260}>
          <SectionTitle eyebrow="Media" title="What you sent" />
          <div className="media-grid">
            <MetricCard label="Images" value={stats.images} />
            <MetricCard label="Videos" value={stats.videos} />
            <MetricCard label="Audio" value={stats.audio} />
            <MetricCard label="Documents" value={stats.documents} />
          </div>
          <div className="quote-card">
            <span>Longest message</span>
            <p>{stats.longestMessage ? trimText(stats.longestMessage.text, 220) : "No participant messages in the selected window."}</p>
            {stats.longestMessage && <small>{stats.longestMessage.sender} in {stats.longestMessage.chatTitle}</small>}
          </div>
        </LazySection>
      </section>

      <aside className="detail-panel">
        <section className="panel-block">
          <h2>Annual split</h2>
          <ProgressRow label="You" value={stats.yourMessages} total={Math.max(1, stats.yourMessages + stats.partnerMessages)} />
          <ProgressRow label="Partners" value={stats.partnerMessages} total={Math.max(1, stats.yourMessages + stats.partnerMessages)} />
          <ProgressRow label="System" value={stats.systemMessages} total={Math.max(1, stats.messages)} />
        </section>

        <section className="panel-block">
          <h2>Response time</h2>
          <ResponseLine label="You" stats={stats.participantStats.filter((stat) => selfAliases.has(stat.name))} />
          <ResponseLine label="Partners" stats={stats.participantStats.filter((stat) => !selfAliases.has(stat.name))} />
        </section>

        <section className="panel-block chat-list">
          <h2>Imported chats</h2>
          {stats.chatSummaries.length ? (
            stats.chatSummaries.slice(0, 12).map((chat) => (
              <article className="chat-row" key={chat.id}>
                <strong>{chat.title}</strong>
                <span>{chat.messages.toLocaleString()} messages · {chat.media.toLocaleString()} media</span>
                <small>{chat.participants.slice(0, 3).join(", ")}</small>
              </article>
            ))
          ) : (
            <p className="empty">No chats imported yet.</p>
          )}
        </section>
      </aside>

      {isAuthModalOpen && (
        <AuthModal
          authMode={authMode}
          blockSeconds={authBlockSeconds}
          displayName={authDisplayName}
          email={authEmail}
          error={authError}
          isAuthenticating={isAuthenticating}
          isBlocked={isAuthBlocked}
          password={authPassword}
          setAuthMode={setAuthMode}
          setDisplayName={setAuthDisplayName}
          setEmail={setAuthEmail}
          setPassword={setAuthPassword}
          onClose={() => authUser && setIsAuthModalOpen(false)}
          onSubmit={handleAuthSubmit}
        />
      )}
    </main>
  );
}

function AuthModal(props: {
  authMode: AuthMode;
  blockSeconds: number;
  displayName: string;
  email: string;
  error: string;
  isAuthenticating: boolean;
  isBlocked: boolean;
  password: string;
  setAuthMode: (mode: AuthMode) => void;
  setDisplayName: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="auth-modal" onSubmit={props.onSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Private access</p>
            <h2>{props.authMode === "login" ? "Login required" : "Create account"}</h2>
          </div>
          <button type="button" onClick={props.onClose} aria-label="Close login">
            ×
          </button>
        </div>
        {props.authMode === "register" && (
          <label className="field">
            Display name
            <input value={props.displayName} autoComplete="name" onChange={(event) => props.setDisplayName(event.target.value)} />
          </label>
        )}
        <label className="field">
          Email
          <input value={props.email} autoComplete="email" inputMode="email" onChange={(event) => props.setEmail(event.target.value)} />
        </label>
        <label className="field">
          Password
          <input value={props.password} autoComplete={props.authMode === "login" ? "current-password" : "new-password"} type="password" onChange={(event) => props.setPassword(event.target.value)} />
        </label>
        {props.error && <div className="error-message">{props.error}</div>}
        <button className="primary-button" disabled={props.isAuthenticating || props.isBlocked} type="submit">
          {props.isBlocked ? `Try again in ${props.blockSeconds}s` : props.isAuthenticating ? "Working..." : props.authMode === "login" ? "Login" : "Register"}
        </button>
        <button className="text-button" type="button" onClick={() => props.setAuthMode(props.authMode === "login" ? "register" : "login")}>
          {props.authMode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </div>
  );
}

function LazySection({ children, className, minHeight }: { children: ReactNode; className: string; minHeight: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={className} ref={ref} style={{ minHeight }}>
      {isVisible ? children : <div className="section-skeleton" />}
    </section>
  );
}

function ParticipantTable({ participants }: { participants: ParticipantStats[] }) {
  const visible = participants.slice(0, 10);
  return (
    <div className="participant-table">
      {visible.length ? (
        visible.map((participant) => (
          <div className="participant-row" key={participant.name}>
            <strong>{participant.name}</strong>
            <span>{participant.messages.toLocaleString()} messages</span>
            <span>{participant.words.toLocaleString()} words</span>
            <span>{formatDuration(participant.averageResponseMs)}</span>
          </div>
        ))
      ) : (
        <p className="empty">No participant messages yet.</p>
      )}
    </div>
  );
}

function HourBars({ stats }: { stats: WrappedStats }) {
  const max = Math.max(...stats.hourlyActivity.map((item) => item.count), 1);
  return (
    <div className="hour-bars" aria-label="Messages by hour">
      {stats.hourlyActivity.map((item) => (
        <span key={item.hour} title={`${item.hour}:00 · ${item.count} messages`}>
          <i style={{ height: `${Math.max(6, (item.count / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function ResponseLine({ label, stats }: { label: string; stats: ParticipantStats[] }) {
  const totalResponses = stats.reduce((total, stat) => total + stat.responseCount, 0);
  const totalMs = stats.reduce((total, stat) => total + stat.totalResponseMs, 0);
  const average = totalResponses ? Math.round(totalMs / totalResponses) : null;
  return (
    <div className="response-line">
      <span>{label}</span>
      <strong>{formatDuration(average)}</strong>
      <small>{totalResponses.toLocaleString()} replies counted</small>
    </div>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = Math.round((value / total) * 100);
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
      <div className="progress-track">
        <i style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function Highlight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="highlight-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function DesktopOnly() {
  return (
    <main className="mobile-disabled">
      <div>
        <p className="eyebrow">Desktop only</p>
        <h1>Whatsapp Wrapped needs a larger screen.</h1>
        <p>Chat exports can be large, so usage is disabled on mobile. Open this page on a laptop or desktop.</p>
      </div>
    </main>
  );
}

function validateCredentials(email: string, password: string, displayName?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (displayName !== undefined && displayName.length < 2) return "Display name must be at least 2 characters.";
  return "";
}

function shouldCountAuthFailure(error: AuthError, mode: AuthMode) {
  const message = error.message.toLowerCase();
  return mode === "login" || message.includes("password") || message.includes("credentials");
}

function getAuthErrorMessage(error: AuthError, mode: AuthMode) {
  const message = error.message.toLowerCase();
  if (message.includes("invalid login credentials")) return "Invalid email or password.";
  if (message.includes("already registered") || message.includes("already exists")) return "An account already exists for this email.";
  return mode === "login" ? "Login failed. Check your credentials and try again." : "Registration failed. Check your details and try again.";
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatReadableDay(label: string) {
  const [year, month, day] = label.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day));
}

function formatDuration(ms: number | null) {
  if (!ms) return "No data";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days}d ${dayHours}h` : `${days}d`;
}

function trimText(text: string, limit: number) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}...` : cleaned;
}
