import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { Activity, Archive, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronRight, Clock3, FileArchive, FileText, FolderOpen, Image, Info, LockKeyhole, MessageCircle, MessagesSquare, Mic2, Plus, RefreshCw, ShieldCheck, Sparkles, UploadCloud, Users, Video, X, Zap } from "lucide-react";
import { calculateWrappedStats, getAllParticipants, getRollingYearWindow, mergeChats } from "./stats";
import type { ParsedChat, ParticipantStats, WrappedStats } from "./types";

export default function App() {
  const [chats, setChats] = useState<ParsedChat[]>([]);
  const [selfAliases, setSelfAliases] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const participants = useMemo(() => getAllParticipants(chats), [chats]);
  const stats = useMemo(() => calculateWrappedStats(chats, selfAliases, new Date()), [chats, selfAliases]);
  const windowLabel = `${formatDate(stats.windowStart)} – ${formatDate(stats.windowEnd)}`;

  useEffect(() => { document.title = "WhatsApp Wrapped — Your year in conversation"; }, []);
  useEffect(() => { setSelfAliases((current) => new Set([...current].filter((alias) => participants.includes(alias)))); }, [participants]);

  async function importFiles(selected: File[]) {
    if (!selected.length) return;
    const zipFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".zip"));
    const rejected = selected.length - zipFiles.length;
    if (!zipFiles.length) { setErrors(["Choose a WhatsApp chat export in ZIP format."]); return; }
    const { windowStart, windowEnd } = getRollingYearWindow(new Date());
    setIsImporting(true);
    setStatus(`Reading ${zipFiles.length} private ${zipFiles.length === 1 ? "archive" : "archives"}…`);
    setErrors(rejected ? [`${rejected} non-ZIP ${rejected === 1 ? "file was" : "files were"} skipped.`] : []);
    try {
      const { parseWhatsAppFiles } = await import("./parser");
      const result = await parseWhatsAppFiles(zipFiles, windowStart, windowEnd);
      setChats((current) => mergeChats(current, result.chats));
      setErrors((current) => [...current, ...result.errors]);
      setStatus(result.chats.length ? `${result.chats.length} ${result.chats.length === 1 ? "conversation" : "conversations"} added to your Wrapped.` : "No conversations were found.");
    } catch { setErrors((current) => [...current, "The archive could not be read. Export the chat again and keep the ZIP unchanged."]); }
    finally { setIsImporting(false); }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) { const selected = Array.from(event.target.files ?? []); event.target.value = ""; void importFiles(selected); }
  function handleDrop(event: DragEvent<HTMLElement>) { event.preventDefault(); setIsDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }
  function toggleAlias(name: string) { setSelfAliases((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; }); }
  function clearSession() { setChats([]); setSelfAliases(new Set()); setErrors([]); setStatus(""); }

  return <div className="site-shell">
    <input ref={inputRef} className="visually-hidden" type="file" accept=".zip,application/zip" multiple onChange={handleInput} />
    <Header hasData={!!chats.length} isImporting={isImporting} onImport={() => inputRef.current?.click()} />
    {!chats.length
      ? <Landing {...{ isDragging, isImporting, status, errors, windowLabel }} onBrowse={() => inputRef.current?.click()} onDragChange={setIsDragging} onDrop={handleDrop} />
      : <Dashboard {...{ chats, stats, participants, selfAliases, windowLabel, status, errors }} onToggleAlias={toggleAlias} onImport={() => inputRef.current?.click()} onClear={clearSession} />}
  </div>;
}

function Header({ hasData, isImporting, onImport }: { hasData: boolean; isImporting: boolean; onImport: () => void }) {
  return <header className="topbar">
    <a className="brand" href="./"><span className="brand-mark"><MessageCircle size={18} fill="currentColor" /></span><span className="brand-name">wrapped<span>/locally</span></span></a>
    <div className="year-pill"><CalendarDays size={14} /><span>Rolling 365 days</span></div>
    <div className="top-actions"><span className="privacy-label"><ShieldCheck size={14} /> On-device analysis</span>{hasData && <Button variant="secondary" size="sm" isPending={isImporting} onPress={onImport}>{isImporting ? <RefreshCw className="spin" size={15} /> : <Plus size={15} />} Add exports</Button>}</div>
  </header>;
}

type LandingProps = { isDragging: boolean; isImporting: boolean; status: string; errors: string[]; windowLabel: string; onBrowse: () => void; onDragChange: (value: boolean) => void; onDrop: (event: DragEvent<HTMLElement>) => void };
function Landing({ isDragging, isImporting, status, errors, windowLabel, onBrowse, onDragChange, onDrop }: LandingProps) {
  return <main className="landing">
    <div className="orb orb-one" /><div className="orb orb-two" />
    <section className="hero-copy">
      <Chip color="success" variant="soft" size="sm"><Sparkles size={13} /> Your conversations, distilled</Chip>
      <h1>A year of messages.<br /><em>One beautiful story.</em></h1>
      <p>Turn your WhatsApp exports into a considered, private recap of the people, rhythms and moments that shaped your year.</p>
      <div className="trust-list"><span><Check size={14} /> No account</span><span><Check size={14} /> Nothing uploaded</span><span><Check size={14} /> Nothing stored</span></div>
    </section>
    <Card className={`import-card ${isDragging ? "is-dragging" : ""}`} variant="tertiary"><Card.Content onDragOver={(event) => { event.preventDefault(); onDragChange(true); }} onDragLeave={() => onDragChange(false)} onDrop={onDrop}>
      <div className="archive-visual"><span className="archive-sheet sheet-back"><MessagesSquare size={22} /></span><span className="archive-sheet sheet-front"><FileArchive size={31} /><small>ZIP</small></span><span className="upload-bubble"><UploadCloud size={20} /></span></div>
      <Chip color="success" variant="soft" size="sm">Private import</Chip>
      <h2>{isImporting ? "Reading your conversations…" : "Drop your exports here"}</h2>
      <p>Choose one or several WhatsApp chat ZIPs.<br />Media is counted, never opened or uploaded.</p>
      <Button className="primary-import" variant="primary" size="lg" isPending={isImporting} onPress={onBrowse}>{isImporting ? <RefreshCw className="spin" size={17} /> : <FolderOpen size={17} />}{isImporting ? "Analyzing locally" : "Choose ZIP exports"}</Button>
      <small className="date-window">Analyzing {windowLabel}</small>
      {status && <div className="inline-status"><Check size={13} /> {status}</div>}
      {errors.map((error) => <div className="inline-error" key={error}><Info size={13} /> {error}</div>)}
    </Card.Content></Card>
    <section className="process-strip"><ProcessStep number="01" icon={<Archive size={18} />} title="Export a chat" detail="In WhatsApp, choose Export chat and save the ZIP." /><ProcessStep number="02" icon={<LockKeyhole size={18} />} title="Analyze locally" detail="Your browser reads it in memory—no server involved." /><ProcessStep number="03" icon={<BarChart3 size={18} />} title="See your year" detail="Explore patterns, people, media and reply times." /></section>
    <footer className="landing-footer"><span>Made for meaningful conversations.</span><a href="mailto:dev@marfeyx.ch">dev@marfeyx.ch</a><span>Private by architecture.</span></footer>
  </main>;
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: number | string; detail: string; tone: string }) { return <Card className={`metric-card tone-${tone}`} variant="default"><Card.Content><div><span>{icon}</span><small>{label}</small></div><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong><p>{detail}</p></Card.Content></Card>; }
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="section-title"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>; }
function Highlight({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <article className="highlight"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function HourBars({ stats }: { stats: WrappedStats }) { const max = Math.max(...stats.hourlyActivity.map((item) => item.count), 1); return <div className="chart-wrap"><div className="hour-bars">{stats.hourlyActivity.map((item) => <span key={item.hour} title={`${item.hour}:00 · ${item.count} messages`}><i style={{ height: `${Math.max(4, (item.count / max) * 100)}%` }} /></span>)}</div><div className="chart-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></div>; }
function ParticipantTable({ participants }: { participants: ParticipantStats[] }) {
  const visible = participants.slice(0, 8); const max = Math.max(visible[0]?.messages ?? 0, 1);
  if (!visible.length) return <p className="empty-state">No participant messages in this window.</p>;
  return <div className="participant-table">{visible.map((person, index) => <div className="participant-row" key={person.name}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="person-avatar">{initials(person.name)}</span><div className="person-data"><strong>{person.name}</strong><div><i style={{ width: `${(person.messages / max) * 100}%` }} /></div></div><span className="person-stat"><strong>{person.messages.toLocaleString()}</strong><small>messages</small></span><span className="person-stat optional"><strong>{person.words.toLocaleString()}</strong><small>words</small></span><span className="person-stat optional"><strong>{formatDuration(person.averageResponseMs)}</strong><small>reply time</small></span></div>)}</div>;
}

function ProcessStep({ number, icon, title, detail }: { number: string; icon: ReactNode; title: string; detail: string }) {
  return <article><span className="step-number">{number}</span><span className="step-icon">{icon}</span><div><strong>{title}</strong><p>{detail}</p></div></article>;
}

type DashboardProps = { chats: ParsedChat[]; stats: WrappedStats; participants: string[]; selfAliases: Set<string>; windowLabel: string; status: string; errors: string[]; onToggleAlias: (name: string) => void; onImport: () => void; onClear: () => void };
function Dashboard({ chats, stats, participants, selfAliases, windowLabel, status, errors, onToggleAlias, onImport, onClear }: DashboardProps) {
  const hasAliases = !!selfAliases.size;
  return <main className="dashboard-shell">
    <aside className="left-rail">
      <div className="rail-heading"><span>Current session</span><strong>{chats.length} {chats.length === 1 ? "conversation" : "conversations"}</strong></div>
      <Card className="identity-card" variant="default"><Card.Header><div><Card.Title>Which names are you?</Card.Title><Card.Description>Select every alias that represents you.</Card.Description></div></Card.Header><Card.Content className="alias-list">{participants.map((participant) => <button key={participant} className={`alias-option ${selfAliases.has(participant) ? "selected" : ""}`} onClick={() => onToggleAlias(participant)}><span>{initials(participant)}</span><strong>{participant}</strong><i>{selfAliases.has(participant) && <Check size={12} />}</i></button>)}</Card.Content></Card>
      <div className="rail-section-title"><span>Imported</span><button onClick={onImport}><Plus size={13} /> Add</button></div>
      <div className="rail-chat-list">{stats.chatSummaries.slice(0, 10).map((chat) => <article key={chat.id}><span><MessageCircle size={14} /></span><div><strong>{chat.title}</strong><small>{chat.messages.toLocaleString()} messages</small></div><ChevronRight size={13} /></article>)}</div>
      <button className="clear-session" onClick={onClear}><X size={13} /> Clear private session</button>
      <div className="local-note"><LockKeyhole size={14} /><p><strong>Ephemeral session</strong>Refresh or close this tab and all imported data disappears.</p></div>
    </aside>

    <section className="story-content">
      <div className="story-intro"><div><p className="eyebrow">Your WhatsApp Wrapped</p><h1>Your year,<br /><em>in conversation.</em></h1><p>{windowLabel} · {stats.chats} exports · Generated just now</p></div><div className="story-seal"><Sparkles size={18} /><span>Private<br />edition</span></div></div>
      {!hasAliases && <div className="setup-banner"><span><Users size={17} /></span><div><strong>One small step before the reveal</strong><p>Select your name or aliases in the left panel to separate your messages from everyone else’s.</p></div><ArrowUpRight size={16} /></div>}
      {status && <div className="subtle-status"><Check size={13} /> {status}</div>}{errors.map((error) => <div className="subtle-error" key={error}><Info size={13} /> {error}</div>)}
      <section className="metric-grid"><MetricCard icon={<MessagesSquare size={17} />} label="Total messages" value={stats.messages} detail={`${stats.chats} conversations`} tone="mint" /><MetricCard icon={<MessageCircle size={17} />} label="Your messages" value={hasAliases ? stats.yourMessages : "—"} detail={hasAliases ? `${percent(stats.yourMessages, stats.yourMessages + stats.partnerMessages)}% of participant messages` : "Select your aliases"} tone="blue" /><MetricCard icon={<CalendarDays size={17} />} label="Active days" value={stats.activeDays} detail={`${percent(stats.activeDays, 365)}% of the year`} tone="amber" /><MetricCard icon={<Mic2 size={17} />} label="Voice notes" value={stats.voiceMemos} detail={`${stats.audio} audio files total`} tone="rose" /></section>
      <Card className="story-card pulse-card" variant="default"><Card.Header><SectionTitle eyebrow="Your rhythm" title="When conversations came alive" /><Activity size={18} /></Card.Header><Card.Content><div className="highlight-pair"><Highlight icon={<CalendarDays size={16} />} label="Busiest day" value={stats.busiestDay ? formatReadableDay(stats.busiestDay.label) : "No data yet"} detail={`${stats.busiestDay?.count.toLocaleString() ?? 0} messages`} /><Highlight icon={<Clock3 size={16} />} label="Peak hour" value={stats.busiestHour ? `${String(stats.busiestHour.hour).padStart(2, "0")}:00` : "No data yet"} detail={`${stats.busiestHour?.count.toLocaleString() ?? 0} messages`} /></div><HourBars stats={stats} /></Card.Content></Card>
      <Card className="story-card people-card" variant="default"><Card.Header><SectionTitle eyebrow="Your people" title="Who kept the conversation going" /><Users size={18} /></Card.Header><Card.Content><ParticipantTable participants={stats.participantStats} /></Card.Content></Card>
      <section className="media-section"><SectionTitle eyebrow="Beyond words" title="The things you shared" /><div className="media-grid"><MediaCard icon={<Image size={17} />} label="Images" value={stats.images} tone="green" /><MediaCard icon={<Video size={17} />} label="Videos" value={stats.videos} tone="purple" /><MediaCard icon={<Mic2 size={17} />} label="Audio" value={stats.audio} tone="orange" /><MediaCard icon={<FileText size={17} />} label="Documents" value={stats.documents} tone="blue" /></div><Card className="quote-card" variant="secondary"><Card.Content><span>Longest message</span><blockquote>“{stats.longestMessage ? trimText(stats.longestMessage.text, 260) : "No participant messages in this window yet."}”</blockquote>{stats.longestMessage && <small>{stats.longestMessage.sender} · {stats.longestMessage.chatTitle}</small>}</Card.Content></Card></section>
    </section>
    <aside className="insight-rail">
      <Card className="insight-card split-card" variant="default"><Card.Header><div><Card.Title>The annual split</Card.Title><Card.Description>Participant messages</Card.Description></div><Zap size={16} /></Card.Header><Card.Content><div className="donut" style={{ "--split": `${percent(stats.yourMessages, Math.max(1, stats.yourMessages + stats.partnerMessages))}%` } as React.CSSProperties}><span><strong>{percent(stats.yourMessages, Math.max(1, stats.yourMessages + stats.partnerMessages))}%</strong><small>you</small></span></div><ProgressRow label="You" value={stats.yourMessages} total={Math.max(1, stats.yourMessages + stats.partnerMessages)} color="mint" /><ProgressRow label="Others" value={stats.partnerMessages} total={Math.max(1, stats.yourMessages + stats.partnerMessages)} color="blue" /><ProgressRow label="System" value={stats.systemMessages} total={Math.max(1, stats.messages)} color="muted" /></Card.Content></Card>
      <Card className="insight-card" variant="default"><Card.Header><div><Card.Title>Reply tempo</Card.Title><Card.Description>Average time to respond</Card.Description></div><Clock3 size={16} /></Card.Header><Card.Content className="response-grid"><ResponseLine label="You" stats={stats.participantStats.filter((item) => selfAliases.has(item.name))} /><ResponseLine label="Everyone else" stats={stats.participantStats.filter((item) => !selfAliases.has(item.name))} /></Card.Content></Card>
      <Card className="insight-card recap-card" variant="default"><Card.Header><div><Card.Title>At a glance</Card.Title><Card.Description>Your year in numbers</Card.Description></div></Card.Header><Card.Content><RecapRow label="Words written" value={stats.words.toLocaleString()} /><RecapRow label="Text messages" value={stats.textMessages.toLocaleString()} /><RecapRow label="Media omitted" value={stats.omittedMedia.toLocaleString()} /><RecapRow label="Outside date window" value={stats.skippedMessages.toLocaleString()} /></Card.Content></Card>
    </aside>
  </main>;
}

function MediaCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) { return <Card className={`media-card media-${tone}`} variant="default"><Card.Content><span>{icon}</span><div><strong>{value.toLocaleString()}</strong><small>{label}</small></div></Card.Content></Card>; }
function ResponseLine({ label, stats }: { label: string; stats: ParticipantStats[] }) { const responses = stats.reduce((sum, item) => sum + item.responseCount, 0); const totalMs = stats.reduce((sum, item) => sum + item.totalResponseMs, 0); return <div className="response-line"><span>{label}</span><strong>{formatDuration(responses ? Math.round(totalMs / responses) : null)}</strong><small>{responses.toLocaleString()} replies measured</small></div>; }
function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) { return <div className="progress-row"><div><span>{label}</span><strong>{value.toLocaleString()}</strong></div><div className="progress-track"><i className={color} style={{ width: `${percent(value, total)}%` }} /></div></div>; }
function RecapRow({ label, value }: { label: string; value: string }) { return <div className="recap-row"><span>{label}</span><strong>{value}</strong></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function percent(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
function formatDate(date: Date) { return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
function formatReadableDay(label: string) { const [year, month, day] = label.split("-").map(Number); return formatDate(new Date(year, month - 1, day)); }
function formatDuration(ms: number | null) { if (!ms) return "No data"; const minutes = Math.round(ms / 60000); if (minutes < 60) return `${minutes}m`; const hours = Math.floor(minutes / 60); const remaining = minutes % 60; if (hours < 24) return remaining ? `${hours}h ${remaining}m` : `${hours}h`; return `${Math.floor(hours / 24)}d ${hours % 24}h`; }
function trimText(text: string, limit: number) { const clean = text.replace(/\s+/g, " ").trim(); return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean; }
