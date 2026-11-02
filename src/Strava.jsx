import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, RotateCw, Footprints, TrendingUp, TrendingDown, Trophy, Flame, Mountain,
  Timer, Route as RouteIcon, Heart, Zap, ChevronDown, Target, Check, AlertTriangle, Minus,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { usePersistentState } from "./lib/storage";
import {
  takePendingStravaCallback, clearTakenStravaCallback, stravaStatus, stravaSync, stravaExchange,
  stravaDisconnect, stravaAuthorize, loadCachedRuns, clearCachedRuns, fetchRuns, refreshRuns,
} from "./lib/strava";
import {
  prepRuns, summarize, RANGES, inWindow, weeklySeries, linreg, pctChange, records, progressInsights,
  routePath, fmtPace, fmtDuration, fmtKm, fmtDM, fmtDMY, todayNum, weekStart, dayNum,
} from "./lib/stravaStats";

const ORANGE = "#fc4c02";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function timeAgo(iso) {
  if (!iso) return "nunca";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

function Delta({ cur, prev, lowerBetter = false, unit = "%" }) {
  const p = pctChange(cur, prev);
  if (p == null || !isFinite(p)) return null;
  if (Math.abs(p) < 0.5) return <span className="stvDelta"><Minus size={11} /> igual</span>;
  const up = p > 0;
  const good = lowerBetter ? !up : up;
  return (
    <span className={"stvDelta " + (good ? "good" : "bad")}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(Math.round(p))}{unit}
    </span>
  );
}

function RouteSvg({ polyline, size = 56, stroke = 2 }) {
  const d = useMemo(() => routePath(polyline, 100, 8), [polyline]);
  if (!d) return <div className="stvRouteEmpty" style={{ width: size, height: size }}><Footprints size={size / 3} /></div>;
  return (
    <svg className="stvRoute" viewBox="0 0 100 100" width={size} height={size}>
      <path d={d} fill="none" stroke={ORANGE} strokeWidth={stroke * (100 / size)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Gráfico: km por semana ----------
function WeeklyBars({ weeks, goal }) {
  const W = 640, H = 210, L = 34, R = 8, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(goal || 0, ...weeks.map(w => w.km), 5) * 1.12;
  const bw = pw / weeks.length;
  const closed = weeks.filter(w => !w.current && w.runs);
  const avg = closed.length ? closed.reduce((s, w) => s + w.km, 0) / closed.length : 0;
  const y = (v) => T + ph - (v / max) * ph;
  const every = Math.ceil(weeks.length / 8);
  const ticks = [0, max / 2, max].map(v => Math.round(v));
  return (
    <svg className="stvChart" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stvGrid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="stvAxis">{v}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const h = Math.max(w.km ? 2 : 0, (w.km / max) * ph);
        return (
          <g key={w.start}>
            <rect x={L + i * bw + bw * 0.16} y={T + ph - h} width={bw * 0.68} height={h} rx={Math.min(5, bw * 0.2)}
              fill={ORANGE} opacity={w.current ? 1 : 0.62}>
              <title>{`Semana de ${fmtDM(w.start)}: ${fmtKm(w.km)} km em ${w.runs} corrida${w.runs === 1 ? "" : "s"}`}</title>
            </rect>
            {i % every === 0 && <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="stvAxis">{fmtDM(w.start)}</text>}
          </g>
        );
      })}
      {avg > 0 && <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} className="stvAvgLine"><title>{`Média: ${fmtKm(avg)} km/semana`}</title></line>}
      {goal > 0 && <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} className="stvGoalLine"><title>{`Meta: ${goal} km/semana`}</title></line>}
    </svg>
  );
}

// ---------- Gráfico: pace ao longo do tempo ----------
function PaceChart({ runs, today, days }) {
  const pts = runs.filter(r => r.km >= 2);
  if (pts.length < 3) return <p className="stvMuted">Poucas corridas no período para mostrar a evolução do pace.</p>;
  const W = 640, H = 220, L = 40, R = 10, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const x0 = days === Infinity ? pts[0].day : today - days, x1 = today;
  const sorted = [...pts].sort((a, b) => a.pace - b.pace);
  const lo = sorted[Math.floor(sorted.length * 0.03)].pace, hi = sorted[Math.ceil(sorted.length * 0.97) - 1].pace;
  const pad = Math.max(10, (hi - lo) * 0.1);
  const pMin = lo - pad, pMax = hi + pad;
  const x = (d) => L + ((d - x0) / Math.max(1, x1 - x0)) * pw;
  const y = (p) => T + ((Math.min(pMax, Math.max(pMin, p)) - pMin) / (pMax - pMin)) * ph; // rápido = em cima
  const win = 5;
  const ma = pts.map((_, i) => {
    const sl = pts.slice(Math.max(0, i - win + 1), i + 1);
    return { d: pts[i].day, p: sl.reduce((s, r) => s + r.pace, 0) / sl.length };
  });
  const reg = linreg(pts.map(r => ({ x: r.day, y: r.pace })));
  const ticks = [lo, (lo + hi) / 2, hi];
  const xt = [x0, (x0 + x1) / 2, x1];
  const slope30 = reg ? reg.slope * 30 : 0;
  return (
    <>
      <svg className="stvChart" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stvGrid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="stvAxis">{fmtPace(v)}</text>
          </g>
        ))}
        {xt.map((d, i) => <text key={i} x={x(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="stvAxis">{fmtDM(Math.round(d))}</text>)}
        {pts.map((r) => (
          <circle key={r.strava_id} cx={x(r.day)} cy={y(r.pace)} r={Math.min(7, 2.5 + r.km / 4)} fill={ORANGE} opacity="0.35">
            <title>{`${fmtDMY(r.day)} · ${fmtKm(r.km)} km · ${fmtPace(r.pace)}/km`}</title>
          </circle>
        ))}
        <path d={ma.map((m, i) => `${i ? "L" : "M"}${x(m.d).toFixed(1)} ${y(m.p).toFixed(1)}`).join("")} className="stvTrend" />
        {reg && <line x1={x(pts[0].day)} y1={y(reg.intercept + reg.slope * pts[0].day)} x2={x(pts[pts.length - 1].day)} y2={y(reg.intercept + reg.slope * pts[pts.length - 1].day)} className="stvReg" />}
      </svg>
      <p className="stvMuted stvChartNote">
        Cada ponto é uma corrida (maior = mais longa). Linha laranja: média móvel de 5 corridas.
        {reg && Math.abs(slope30) >= 1 && <> Tendência: <b className={slope30 < 0 ? "stvGoodTxt" : "stvBadTxt"}>{slope30 < 0 ? "−" : "+"}{Math.round(Math.abs(slope30))}s/km por mês</b> ({slope30 < 0 ? "mais rápido" : "mais lento"}).</>}
      </p>
    </>
  );
}

// ---------- Mapa de calor: últimas semanas ----------
function Heatmap({ runs, today, weeks = 20 }) {
  const cur = weekStart(today);
  const byDay = {};
  runs.forEach(r => { byDay[r.day] = (byDay[r.day] || 0) + r.km; });
  const cols = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = cur - w * 7;
    cols.push(Array.from({ length: 7 }, (_, i) => ws + i));
  }
  const level = (km) => (!km ? 0 : km < 5 ? 0.3 : km < 10 ? 0.55 : km < 15 ? 0.78 : 1);
  return (
    <div className="stvHeat">
      <div className="stvHeatDays">{WEEKDAYS.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ""}</span>)}</div>
      <div className="stvHeatGrid">
        {cols.map((col, ci) => (
          <div key={ci} className="stvHeatCol">
            {col.map(d => {
              const km = byDay[d] || 0;
              const future = d > today;
              return (
                <i key={d} className={"stvHeatCell" + (future ? " future" : "")}
                  style={km ? { background: ORANGE, opacity: level(km) } : undefined}
                  title={future ? "" : `${fmtDMY(d)}: ${km ? fmtKm(km) + " km" : "sem corrida"}`} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalRing({ km, goal, onChange }) {
  const pct = goal > 0 ? Math.min(1, km / goal) : 0;
  const r = 38, c = 2 * Math.PI * r;
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(String(goal));
  const commit = () => {
    const n = Math.round(Number(String(val).replace(",", ".")));
    if (n > 0 && n <= 500) onChange(n);
    setEdit(false);
  };
  return (
    <div className="stvGoal">
      <svg viewBox="0 0 100 100" width="96" height="96">
        <circle cx="50" cy="50" r={r} className="stvRingBg" />
        <circle cx="50" cy="50" r={r} className="stvRingFg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 50 50)" />
        <text x="50" y="49" textAnchor="middle" className="stvRingBig">{fmtKm(km)}</text>
        <text x="50" y="64" textAnchor="middle" className="stvRingSmall">km</text>
      </svg>
      <div className="stvGoalInfo">
        <small>META DA SEMANA</small>
        {edit ? (
          <div className="stvGoalEdit">
            <input autoFocus inputMode="numeric" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && commit()} />
            <span>km</span>
            <button className="ghost" onClick={commit}><Check size={14} /></button>
          </div>
        ) : (
          <button className="stvGoalBtn" onClick={() => { setVal(String(goal)); setEdit(true); }}><Target size={14} /> {goal} km <em>editar</em></button>
        )}
        <p>{km >= goal ? "Meta batida! 🎉" : `Faltam ${fmtKm(goal - km)} km`}</p>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, children }) {
  return (
    <div className="stvKpi">
      <div className="stvKpiHead">{icon}<span>{label}</span></div>
      <strong>{value}</strong>
      <div className="stvKpiSub">{sub}{children}</div>
    </div>
  );
}

function RunRow({ r, open, onToggle }) {
  return (
    <div className={"stvRun" + (open ? " open" : "")}>
      <button className="stvRunMain" onClick={onToggle}>
        <RouteSvg polyline={r.polyline} size={52} />
        <div className="stvRunInfo">
          <b>{r.name}</b>
          <small>{fmtDMY(r.day)}{r.sport_type === "TrailRun" ? " · Trilha" : r.sport_type === "VirtualRun" ? " · Esteira/virtual" : ""}</small>
        </div>
        <div className="stvRunNums">
          <b>{fmtKm(r.km, 2)} km</b>
          <small>{fmtPace(r.pace)}/km</small>
        </div>
        <ChevronDown size={16} className="stvChev" />
      </button>
      {open && (
        <div className="stvRunDetail">
          <RouteSvg polyline={r.polyline} size={150} stroke={3} />
          <div className="stvRunStats">
            <div><small>Tempo</small><b>{fmtDuration(r.moving_time)}</b></div>
            <div><small>Pace</small><b>{fmtPace(r.pace)}/km</b></div>
            <div><small>Elevação</small><b>{Math.round(r.elevation || 0)} m</b></div>
            {r.avg_hr ? <div><small>FC média</small><b>{Math.round(r.avg_hr)} bpm</b></div> : null}
            {r.max_hr ? <div><small>FC máx.</small><b>{Math.round(r.max_hr)} bpm</b></div> : null}
            {r.avg_cadence ? <div><small>Cadência</small><b>{Math.round(r.avg_cadence * 2)} spm</b></div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StravaRuns({ onBack }) {
  const [status, setStatus] = useState(null); // null = carregando
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");
  const [range, setRange] = useState("12w");
  const [goal, setGoal] = usePersistentState("libano-strava-goal", 20);
  const [openId, setOpenId] = useState(null);
  const [shown, setShown] = useState(10);
  const [menu, setMenu] = useState(false);
  const rowsRef = useRef([]);
  rowsRef.current = rows;

  const sync = async (full = false) => {
    setSyncing(true); setErr("");
    try {
      const r = await stravaSync(full);
      setStatus(s => ({ ...s, connected: true, lastSyncedAt: r.lastSyncedAt }));
      setRows(full || !rowsRef.current.length ? await fetchRuns() : await refreshRuns(rowsRef.current));
    } catch (e) { setErr(e.message || "Não foi possível sincronizar."); }
    finally { setSyncing(false); }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setStatus({ connected: false, offline: true }); return; }
      try {
        const pending = takePendingStravaCallback();
        if (pending) {
          if (pending.error) {
            setErr("A autorização foi cancelada no Strava.");
          } else {
            setBusy("Conectando ao Strava e importando suas corridas…");
            const r = await stravaExchange(pending.code, pending.scope);
            if (!alive) return;
            setStatus({ connected: true, athleteName: r.athleteName, lastSyncedAt: r.lastSyncedAt });
            setRows(await fetchRuns());
            setBusy(null);
            clearTakenStravaCallback();
            return;
          }
          clearTakenStravaCallback();
        }
        const st = await stravaStatus();
        if (!alive) return;
        setStatus(st);
        if (!st.connected) return;
        const cached = await loadCachedRuns();
        if (!alive) return;
        if (cached) setRows(cached);
        else { setBusy("Carregando corridas…"); setRows(await fetchRuns()); setBusy(null); }
        if (!st.lastSyncedAt || Date.now() - new Date(st.lastSyncedAt).getTime() > 3600e3) sync(false);
      } catch (e) {
        if (!alive) return;
        clearTakenStravaCallback();
        setBusy(null);
        setErr(e.message || "Erro ao falar com o Strava.");
        setStatus(s => s || { connected: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  const connect = async () => {
    setErr("");
    try { await stravaAuthorize(); } catch (e) { setErr(e.message || "Não foi possível iniciar a conexão."); }
  };
  const disconnect = async () => {
    setMenu(false);
    if (!window.confirm("Desconectar o Strava? As corridas importadas serão apagadas do Libano (no Strava elas continuam).")) return;
    try {
      await stravaDisconnect();
      await clearCachedRuns();
      setRows([]); setStatus({ connected: false });
    } catch (e) { setErr(e.message); }
  };

  const today = todayNum();
  const runs = useMemo(() => prepRuns(rows), [rows]);
  const rg = RANGES.find(r => r.key === range) || RANGES[1];
  const cur = useMemo(() => inWindow(runs, today, rg.days), [runs, today, rg]);
  const prev = useMemo(() => (rg.days === Infinity ? [] : inWindow(runs, today - rg.days, rg.days)), [runs, today, rg]);
  const a = useMemo(() => summarize(cur), [cur]);
  const b = useMemo(() => summarize(prev), [prev]);
  const prog = useMemo(() => progressInsights(runs, today), [runs, today]);
  const recs = useMemo(() => records(runs), [runs]);
  const weekCount = rg.days === Infinity
    ? Math.min(104, Math.max(8, runs.length ? Math.ceil((today - runs[0].day) / 7) + 1 : 8))
    : Math.max(4, Math.round(rg.days / 7));
  const weeks = useMemo(() => weeklySeries(runs, weekCount, today), [runs, weekCount, today]);
  const thisWeekKm = weeks[weeks.length - 1]?.km || 0;
  const weekdayKm = useMemo(() => {
    const out = Array(7).fill(0), cnt = Array(7).fill(0);
    cur.forEach(r => { const i = (r.day + 3) % 7; out[i] += r.km; cnt[i] += 1; });
    return { km: out, cnt, max: Math.max(...out, 1) };
  }, [cur]);
  const recent = useMemo(() => [...runs].reverse(), [runs]);

  const header = (
    <div className="flashHead">
      <div className="flashHeadTitle">
        <button className="ghost stvBack" onClick={onBack}><ArrowLeft size={16} /> Treino</button>
        <h2 className="stvTitle"><Footprints size={22} color={ORANGE} /> Corridas</h2>
        <p>{status?.connected ? `Strava${status.athleteName ? " · " + status.athleteName : ""} · atualizado ${timeAgo(status.lastSyncedAt)}` : "Seus dados do Strava, organizados."}</p>
      </div>
      {status?.connected && (
        <div className="flashHeadActions">
          <button className="ghost" disabled={syncing} onClick={() => sync(false)}>
            <RotateCw size={15} className={syncing ? "stvSpin" : ""} /> {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          <div className="workoutCopyWrap">
            <button className="ghost" onClick={() => setMenu(m => !m)}>Mais</button>
            {menu && <>
              <div className="workoutCopyBackdrop" onClick={() => setMenu(false)} />
              <div className="workoutCopyMenu">
                <button type="button" onClick={() => { setMenu(false); sync(true); }}>Reimportar tudo</button>
                <button type="button" className="danger" onClick={disconnect}>Desconectar Strava</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );

  if (status === null || busy) {
    return (
      <div className="content">
        {header}
        <div className="stvCard stvCenter"><RotateCw size={22} className="stvSpin" color={ORANGE} /><p>{busy || "Carregando…"}</p></div>
        {err && <div className="stvErr"><AlertTriangle size={15} /> {err}</div>}
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="content">
        {header}
        <div className="stvCard stvConnect">
          <div className="stvConnectIcon"><Footprints size={34} color="#fff" /></div>
          <h3>Conecte sua conta do Strava</h3>
          <p>Importamos suas corridas e mostramos evolução de pace, volume semanal, constância, recordes e alertas de carga — tudo calculado aqui, sem gastar rede à toa.</p>
          {status.offline
            ? <p className="stvMuted">A conexão precisa do modo nuvem (Supabase) ativo.</p>
            : <button className="stvConnectBtn" onClick={connect}>Conectar com Strava</button>}
          <small className="stvMuted">Você autoriza no site do Strava e pode revogar quando quiser.</small>
        </div>
        {err && <div className="stvErr"><AlertTriangle size={15} /> {err}</div>}
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="content">
        {header}
        <div className="flashEmpty">
          <div className="flashEmptyIcon"><Footprints size={30} /></div>
          <h3>Nenhuma corrida importada</h3>
          <p>Conectado! Assim que houver corridas no Strava, toque em Sincronizar.</p>
        </div>
        {err && <div className="stvErr"><AlertTriangle size={15} /> {err}</div>}
      </div>
    );
  }

  const paceBetter = a.pace && b.pace ? a.pace < b.pace : null;
  const rec = (r, label) => r ? (
    <div className="stvRec"><small>{label}</small><b>{fmtPace(r.pace)}/km</b><span>{fmtKm(r.km)} km · {fmtDMY(r.day)}</span></div>
  ) : <div className="stvRec dim"><small>{label}</small><b>—</b><span>ainda sem corrida assim</span></div>;

  return (
    <div className="content stvWrap">
      {header}
      {err && <div className="stvErr"><AlertTriangle size={15} /> {err}</div>}

      <div className="stvRanges">
        {RANGES.map(r => (
          <button key={r.key} className={range === r.key ? "active" : ""} onClick={() => setRange(r.key)}>{r.label}</button>
        ))}
      </div>

      <div className="stvKpis">
        <Kpi icon={<RouteIcon size={14} />} label="Distância" value={`${fmtKm(a.km)} km`} sub={rg.days === Infinity ? "" : "vs. período anterior "}>
          {rg.days !== Infinity && <Delta cur={a.km} prev={b.km} />}
        </Kpi>
        <Kpi icon={<Footprints size={14} />} label="Corridas" value={a.n} sub={a.n ? `${fmtKm(a.km / a.n)} km em média ` : ""}>
          {rg.days !== Infinity && <Delta cur={a.n} prev={b.n} />}
        </Kpi>
        <Kpi icon={<Zap size={14} />} label="Pace médio" value={a.n ? `${fmtPace(a.pace)}/km` : "—"} sub={rg.days === Infinity ? "" : "vs. anterior "}>
          {rg.days !== Infinity && <Delta cur={a.pace} prev={b.pace} lowerBetter />}
        </Kpi>
        <Kpi icon={<Timer size={14} />} label="Tempo correndo" value={fmtDuration(a.time)} sub="" />
        <Kpi icon={<Trophy size={14} />} label="Mais longa" value={`${fmtKm(a.longest)} km`} sub="" />
        <Kpi icon={<Mountain size={14} />} label="Elevação" value={`${Math.round(a.elev)} m`} sub={a.avgHr ? `FC média ${Math.round(a.avgHr)} bpm` : ""} />
      </div>

      <div className="stvCard">
        <h3 className="stvH"><TrendingUp size={17} color={ORANGE} /> Estou melhorando?</h3>
        <small className="stvMuted">Últimas 4 semanas × 4 semanas anteriores</small>
        <ul className="stvInsights">
          {prog.insights.map((i, k) => (
            <li key={k} className={i.tone}>
              {i.tone === "good" ? <TrendingUp size={15} /> : i.tone === "ok" ? <Check size={15} /> : <AlertTriangle size={15} />}
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
        {paceBetter === null && prog.prev.n === 0 && <p className="stvMuted">Ainda não há 4 semanas anteriores para comparar.</p>}
      </div>

      <div className="stvGrid2">
        <div className="stvCard">
          <h3 className="stvH">Meta e semana atual</h3>
          <GoalRing km={thisWeekKm} goal={goal} onChange={setGoal} />
          <h4 className="stvSub">Constância (últimas 20 semanas)</h4>
          <Heatmap runs={runs} today={today} />
        </div>
        <div className="stvCard">
          <h3 className="stvH"><Flame size={17} color={ORANGE} /> Em que dias você corre</h3>
          <small className="stvMuted">Distância por dia da semana no período</small>
          <div className="stvWeekdays">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className="stvWd" title={`${d}: ${fmtKm(weekdayKm.km[i])} km em ${weekdayKm.cnt[i]} corrida${weekdayKm.cnt[i] === 1 ? "" : "s"}`}>
                <div className="stvWdBar"><i style={{ height: `${(weekdayKm.km[i] / weekdayKm.max) * 100}%` }} /></div>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stvCard">
        <h3 className="stvH">Volume por semana</h3>
        <small className="stvMuted">km por semana (seg–dom){goal ? " · linha tracejada verde = meta" : ""} · linha branca = média</small>
        <WeeklyBars weeks={weeks} goal={goal} />
      </div>

      <div className="stvCard">
        <h3 className="stvH">Evolução do pace</h3>
        <PaceChart runs={cur} today={today} days={rg.days} />
      </div>

      <div className="stvCard">
        <h3 className="stvH"><Trophy size={17} color={ORANGE} /> Recordes</h3>
        <small className="stvMuted">Calculados pelo pace médio da corrida inteira (tudo que você já importou)</small>
        <div className="stvRecs">
          {rec(recs.p5, "Melhor pace ≥ 5 km")}
          {rec(recs.p10, "Melhor pace ≥ 10 km")}
          {rec(recs.p21, "Melhor pace ≥ 21 km")}
          {recs.longest && <div className="stvRec"><small>Corrida mais longa</small><b>{fmtKm(recs.longest.km)} km</b><span>{fmtDMY(recs.longest.day)}</span></div>}
          {recs.bestWeek && <div className="stvRec"><small>Melhor semana</small><b>{fmtKm(recs.bestWeek.km)} km</b><span>semana de {fmtDM(recs.bestWeek.start)}</span></div>}
          {recs.climb && <div className="stvRec"><small>Maior elevação</small><b>{Math.round(recs.climb.elevation)} m</b><span>{fmtDMY(recs.climb.day)}</span></div>}
          <div className="stvRec"><small>Total acumulado</small><b>{fmtKm(recs.totalKm, 0)} km</b><span>{runs.length} corridas</span></div>
        </div>
      </div>

      <div className="stvCard">
        <h3 className="stvH">Corridas recentes</h3>
        <div className="stvRuns">
          {recent.slice(0, shown).map(r => (
            <RunRow key={r.strava_id} r={r} open={openId === r.strava_id} onToggle={() => setOpenId(o => (o === r.strava_id ? null : r.strava_id))} />
          ))}
        </div>
        {shown < recent.length && <button className="ghost stvMore" onClick={() => setShown(s => s + 15)}>Mostrar mais</button>}
      </div>
    </div>
  );
}
