import { useEffect, useMemo, useState } from "react";

/**
 * SPA: Reserva de Lockers (5 vistas)
 * - Dashboard (KPIs + próximos)
 * - Reservar (crear reserva)
 * - Mis reservas (listar + cancelar)
 * - Lockers (CRUD simple: crear/desactivar) + sede/edificio/piso
 * - Config (reset + exportar/importar JSON)
 *
 * Persistencia: localStorage
 */

const LS_KEYS = {
  lockers: "lockers_items_v1",
  reservations: "lockers_reservations_v1",
};

/** ✅ Reglas de negocio: Sede -> Edificios -> Pisos */
const SEDES = {
  CENTRO: {
    label: "Centro",
    edificios: {
      "Centro Histórico": [1, 2, 3],
    },
  },
  CAMPUS: {
    label: "Campus",
    edificios: {
      "Santo Domingo": [1, 2, 3, 4],
      "Giordano Bruno": [1, 2, 3],
    },
  },
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPastDate(dateISO) {
  return dateISO < todayISO();
}

function prettyDate(dateISO) {
  const [y, m, d] = dateISO.split("-");
  return `${d}/${m}/${y}`;
}

/** ✅ Lockers por defecto */
const DEFAULT_LOCKERS = [
  { id: "LK-CH-1-01", code: "01", sede: "CENTRO", edificio: "Centro Histórico", piso: 1, active: true },
  { id: "LK-CH-1-02", code: "02", sede: "CENTRO", edificio: "Centro Histórico", piso: 1, active: true },
  { id: "LK-SD-2-01", code: "01", sede: "CAMPUS", edificio: "Santo Domingo", piso: 2, active: true },
  { id: "LK-SD-2-02", code: "02", sede: "CAMPUS", edificio: "Santo Domingo", piso: 2, active: true },
  { id: "LK-GB-3-01", code: "01", sede: "CAMPUS", edificio: "Giordano Bruno", piso: 3, active: true },
];

export default function App() {
  // ✅ Navegación SPA
  const [view, setView] = useState("dashboard");

  // ✅ Datos persistentes
  const [lockers, setLockers] = useState(() => loadLS(LS_KEYS.lockers, DEFAULT_LOCKERS));
  const [reservations, setReservations] = useState(() => loadLS(LS_KEYS.reservations, []));

  // ✅ UI feedback
  const [toast, setToast] = useState({ type: "info", msg: "" });

  // ✅ Persistencia automática
  useEffect(() => saveLS(LS_KEYS.lockers, lockers), [lockers]);
  useEffect(() => saveLS(LS_KEYS.reservations, reservations), [reservations]);

  // ✅ Helpers / derivados
  const activeLockers = useMemo(() => lockers.filter((l) => l.active), [lockers]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const today = reservations.filter((r) => r.date === todayISO()).length;
    const active = activeLockers.length;
    return { total, today, active };
  }, [reservations, activeLockers]);

  const upcomingReservations = useMemo(() => {
    const sorted = [...reservations].sort((a, b) => {
      const A = `${a.date} ${a.start}`;
      const B = `${b.date} ${b.start}`;
      return A.localeCompare(B);
    });
    return sorted.filter((r) => r.date >= todayISO()).slice(0, 6);
  }, [reservations]);

  function notify(type, msg) {
    setToast({ type, msg });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast({ type: "info", msg: "" }), 2600);
  }

  // ✅ Validación de solapamiento: mismo locker + mismo día + cruce horario
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function createReservation(payload) {
    const { lockerId, date, start, end, user, reason } = payload;

    if (!lockerId || !date || !start || !end || !user.trim() || !reason.trim()) {
      notify("error", "Todos los campos son obligatorios.");
      return;
    }
    if (isPastDate(date)) {
      notify("error", "No puedes reservar en una fecha pasada.");
      return;
    }
    if (start >= end) {
      notify("error", "La hora de inicio debe ser menor que la hora de fin.");
      return;
    }

    const locker = lockers.find((l) => l.id === lockerId);
    if (!locker || !locker.active) {
      notify("error", "El locker seleccionado no está disponible.");
      return;
    }

    const sameLockerSameDay = reservations.filter((r) => r.lockerId === lockerId && r.date === date);
    const collision = sameLockerSameDay.some((r) => overlaps(start, end, r.start, r.end));
    if (collision) {
      notify("error", "Conflicto: ya existe una reserva en ese horario para ese locker.");
      return;
    }

    const newR = {
      id: uid(),
      lockerId,
      date,
      start,
      end,
      user: user.trim(),
      reason: reason.trim(),
      status: "CONFIRMADA",
      createdAt: new Date().toISOString(),
    };

    setReservations((prev) => [newR, ...prev]);
    notify("success", "Reserva de locker creada y confirmada.");
    setView("mis-reservas");
  }

  function cancelReservation(id) {
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "CANCELADA" } : r)));
    notify("info", "Reserva cancelada.");
  }

  function addLocker({ id, code, sede, edificio, piso }) {
    const cleanId = id.trim().toUpperCase();
    const cleanCode = String(code ?? "").trim();
    const floor = Number(piso);

    if (!cleanId || !cleanCode || !sede || !edificio || !floor) {
      notify("error", "Completa todos los campos (ID, código, sede, edificio, piso).");
      return;
    }

    const edificios = SEDES[sede]?.edificios;
    if (!edificios || !Object.keys(edificios).includes(edificio)) {
      notify("error", "El edificio no corresponde a la sede seleccionada.");
      return;
    }

    const pisosPermitidos = edificios[edificio];
    if (!pisosPermitidos.includes(floor)) {
      notify("error", `Piso inválido para ${edificio}. Pisos permitidos: ${pisosPermitidos.join(", ")}`);
      return;
    }

    if (lockers.some((l) => l.id === cleanId)) {
      notify("error", "Ya existe un locker con ese ID.");
      return;
    }

    setLockers((prev) => [...prev, { id: cleanId, code: cleanCode, sede, edificio, piso: floor, active: true }]);
    notify("success", "Locker creado.");
  }

  function toggleLocker(id) {
    setLockers((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));
    notify("info", "Estado de locker actualizado.");
  }

  function resetAll() {
    if (!confirm("¿Seguro? Esto borrará lockers/reservas y restablecerá valores por defecto.")) return;
    setLockers(DEFAULT_LOCKERS);
    setReservations([]);
    notify("success", "Datos reiniciados.");
    setView("dashboard");
  }

  function exportJSON() {
    const data = { lockers, reservations, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lockers_backup.json";
    a.click();
    URL.revokeObjectURL(url);
    notify("success", "Backup exportado (JSON).");
  }

  function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.lockers || !parsed.reservations) throw new Error("Estructura inválida");

        // ✅ Sanitiza sede/edificio/piso para que cumpla reglas actuales
        const normalized = parsed.lockers.map((l) => {
          const sede = l.sede && SEDES[l.sede] ? l.sede : "CAMPUS";
          const edificios = SEDES[sede].edificios;
          const edificio = edificios[l.edificio] ? l.edificio : Object.keys(edificios)[0];
          const pisos = edificios[edificio];
          const piso = pisos.includes(Number(l.piso)) ? Number(l.piso) : pisos[0];
          return { ...l, sede, edificio, piso };
        });

        setLockers(normalized);
        setReservations(parsed.reservations);
        notify("success", "Backup importado correctamente.");
        setView("dashboard");
      } catch {
        notify("error", "No se pudo importar. Verifica el archivo JSON.");
      }
    };
    reader.readAsText(file);
  }

  function lockerLabelById(lockerId) {
    const l = lockers.find((x) => x.id === lockerId);
    if (!l) return lockerId;
    const sedeLbl = SEDES[l.sede]?.label ?? l.sede;
    return `Locker ${l.code} • ${sedeLbl} - ${l.edificio} • Piso ${l.piso}`;
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <div>
            <h1>Reserva de Lockers</h1>
            <p>SPA (Vite + React) • Sede/Edificio/Piso • Persistencia con localStorage</p>
          </div>
        </div>

        <nav className="nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={view === "reservar" ? "active" : ""} onClick={() => setView("reservar")}>
            Reservar
          </button>
          <button className={view === "mis-reservas" ? "active" : ""} onClick={() => setView("mis-reservas")}>
            Mis reservas
          </button>
          <button className={view === "lockers" ? "active" : ""} onClick={() => setView("lockers")}>
            Lockers
          </button>
          <button className={view === "config" ? "active" : ""} onClick={() => setView("config")}>
            Config
          </button>
        </nav>
      </header>

      {toast.msg && (
        <div className={`toast ${toast.type}`}>
          <strong>{toast.type.toUpperCase()}:</strong> {toast.msg}
        </div>
      )}

      <main className="main">
        {view === "dashboard" && (
          <section className="card">
            <h2>Dashboard</h2>
            <p className="muted">Resumen rápido del estado de lockers.</p>

            <div className="grid3">
              <div className="kpi">
                <div className="kpi-num">{stats.active}</div>
                <div className="kpi-lbl">Lockers activos</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">{stats.total}</div>
                <div className="kpi-lbl">Reservas totales</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">{stats.today}</div>
                <div className="kpi-lbl">Reservas hoy</div>
              </div>
            </div>

            <hr className="hr" />

            <h3>Próximas reservas</h3>
            {upcomingReservations.length === 0 ? (
              <p className="muted">No hay reservas próximas.</p>
            ) : (
              <div className="table table-5">
                <div className="thead">
                  <div>Fecha</div>
                  <div>Hora</div>
                  <div>Locker (Ubicación)</div>
                  <div>Usuario</div>
                  <div>Estado</div>
                </div>
                {upcomingReservations.map((r) => (
                  <div className="trow" key={r.id}>
                    <div>{prettyDate(r.date)}</div>
                    <div>
                      {r.start} - {r.end}
                    </div>
                    <div>{lockerLabelById(r.lockerId)}</div>
                    <div>{r.user}</div>
                    <div>
                      <span className={`pill ${r.status}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "reservar" && <ReserveView lockers={activeLockers} onCreate={createReservation} />}

        {view === "mis-reservas" && (
          <MyReservationsView reservations={reservations} onCancel={cancelReservation} lockers={lockers} />
        )}

        {view === "lockers" && <LockersView lockers={lockers} onAdd={addLocker} onToggle={toggleLocker} />}

        {view === "config" && <ConfigView onReset={resetAll} onExport={exportJSON} onImport={importJSON} />}
      </main>

      <footer className="footer">
        <span>© 2026 • Lockers • Demo SPA</span>
      </footer>
    </div>
  );
}

/* -------------------- Vistas -------------------- */

function ReserveView({ lockers, onCreate }) {
  // ✅ Filtros jerárquicos: sede -> edificio -> piso -> locker
  const [sede, setSede] = useState("CAMPUS");
  const [edificio, setEdificio] = useState(Object.keys(SEDES.CAMPUS.edificios)[0]);
  const [piso, setPiso] = useState(SEDES.CAMPUS.edificios[Object.keys(SEDES.CAMPUS.edificios)[0]][0]);

  const [lockerId, setLockerId] = useState("");

  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [user, setUser] = useState("");
  const [reason, setReason] = useState("");

  // ✅ Recalcula edificios/pisos cuando cambia sede
  const edificiosDisponibles = useMemo(() => Object.keys(SEDES[sede].edificios), [sede]);
  const pisosDisponibles = useMemo(() => SEDES[sede].edificios[edificio] ?? [], [sede, edificio]);

  // ✅ Lockers disponibles según ubicación seleccionada
  const lockersFiltrados = useMemo(() => {
    return lockers
      .filter((l) => l.sede === sede)
      .filter((l) => l.edificio === edificio)
      .filter((l) => Number(l.piso) === Number(piso));
  }, [lockers, sede, edificio, piso]);

  // ✅ Locker “efectivo” sin useEffect (evita warning de setState dentro de effect)
  const effectiveLockerId = lockerId || lockersFiltrados[0]?.id || "";

  function onChangeSede(value) {
    setSede(value);
    const ed0 = Object.keys(SEDES[value].edificios)[0];
    setEdificio(ed0);
    const p0 = SEDES[value].edificios[ed0][0];
    setPiso(p0);
    setLockerId("");
  }

  function onChangeEdificio(value) {
    setEdificio(value);
    const p0 = SEDES[sede].edificios[value][0];
    setPiso(p0);
    setLockerId("");
  }

  function submit(e) {
    e.preventDefault();
    onCreate({ lockerId: effectiveLockerId, date, start, end, user, reason });
  }

  return (
    <section className="card">
      <h2>Reservar locker</h2>
      <p className="muted">Selecciona ubicación (sede/edificio/piso), luego el locker y el horario.</p>

      {lockers.length === 0 ? (
        <p className="muted">No hay lockers activos. Ve a “Lockers” y activa/crea alguno.</p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="row3-wide">
            <label>
              Sede
              <select value={sede} onChange={(e) => onChangeSede(e.target.value)}>
                {Object.keys(SEDES).map((k) => (
                  <option key={k} value={k}>
                    {SEDES[k].label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Edificio
              <select value={edificio} onChange={(e) => onChangeEdificio(e.target.value)}>
                {edificiosDisponibles.map((ed) => (
                  <option key={ed} value={ed}>
                    {ed}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Piso
              <select value={piso} onChange={(e) => { setPiso(Number(e.target.value)); setLockerId(""); }}>
                {pisosDisponibles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Locker disponible
            <select value={effectiveLockerId} onChange={(e) => setLockerId(e.target.value)} required>
              {lockersFiltrados.length === 0 ? (
                <option value="">No hay lockers activos en esta ubicación</option>
              ) : (
                lockersFiltrados.map((l) => (
                  <option key={l.id} value={l.id}>
                    Locker {l.code} ({l.id})
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="row2">
            <label>
              Fecha
              <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Usuario
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Ej: Sergio Puerto" required />
            </label>
          </div>

          <div className="row2">
            <label>
              Hora inicio
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <label>
              Hora fin
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>

          <label>
            Motivo
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ej: Guardar implementos de laboratorio" required />
          </label>

          <button type="submit" disabled={!effectiveLockerId}>
            Confirmar reserva
          </button>
        </form>
      )}
    </section>
  );
}

function MyReservationsView({ reservations, onCancel, lockers }) {
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  function lockerLabel(id) {
    const l = lockers.find((x) => x.id === id);
    if (!l) return id;
    const sedeLbl = SEDES[l.sede]?.label ?? l.sede;
    return `Locker ${l.code} • ${sedeLbl} - ${l.edificio} • Piso ${l.piso}`;
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return reservations
      .filter((r) => (onlyActive ? r.status === "CONFIRMADA" : true))
      .filter((r) => {
        if (!query) return true;

        const l = lockers.find((x) => x.id === r.lockerId);
        const location = l
          ? `locker ${l.code} ${l.id} ${SEDES[l.sede]?.label ?? l.sede} ${l.edificio} piso ${l.piso}`.toLowerCase()
          : r.lockerId.toLowerCase();

        return (
          r.user.toLowerCase().includes(query) ||
          r.reason.toLowerCase().includes(query) ||
          r.date.includes(query) ||
          r.lockerId.toLowerCase().includes(query) ||
          location.includes(query)
        );
      })
      .sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`));
  }, [reservations, q, onlyActive, lockers]);

  return (
    <section className="card">
      <h2>Mis reservas</h2>
      <p className="muted">
        Filtra por usuario/motivo/fecha o ubicación. Puedes ocultar canceladas con “Solo confirmadas”.
      </p>

      <div className="row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por locker/ubicación, usuario, motivo o fecha"
          aria-label="Buscar reservas"
        />
        <label className="check">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Solo confirmadas
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No hay reservas para mostrar.</p>
      ) : (
        <div className="table table-6">
          <div className="thead">
            <div>Fecha</div>
            <div>Hora</div>
            <div>Locker (Ubicación)</div>
            <div>Usuario</div>
            <div>Motivo</div>
            <div>Acción</div>
          </div>
          {filtered.map((r) => (
            <div className="trow" key={r.id}>
              <div>{prettyDate(r.date)}</div>
              <div>
                {r.start}-{r.end}
              </div>
              <div>{lockerLabel(r.lockerId)}</div>
              <div>{r.user}</div>
              <div className="clip" title={r.reason}>
                {r.reason}
              </div>
              <div>
                {r.status === "CONFIRMADA" ? (
                  <button className="danger" onClick={() => onCancel(r.id)}>
                    Cancelar
                  </button>
                ) : (
                  <span className={`pill ${r.status}`}>{r.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LockersView({ lockers, onAdd, onToggle }) {
  const [id, setId] = useState("");
  const [code, setCode] = useState("01");

  const [sede, setSede] = useState("CAMPUS");
  const [edificio, setEdificio] = useState(Object.keys(SEDES.CAMPUS.edificios)[0]);
  const [piso, setPiso] = useState(SEDES.CAMPUS.edificios[Object.keys(SEDES.CAMPUS.edificios)[0]][0]);

  const edificiosDisponibles = useMemo(() => Object.keys(SEDES[sede].edificios), [sede]);
  const pisosDisponibles = useMemo(() => SEDES[sede].edificios[edificio] ?? [], [sede, edificio]);

  function handleSedeChange(value) {
    setSede(value);
    const ed0 = Object.keys(SEDES[value].edificios)[0];
    setEdificio(ed0);
    const p0 = SEDES[value].edificios[ed0][0];
    setPiso(p0);
  }

  function handleEdificioChange(value) {
    setEdificio(value);
    const p0 = SEDES[sede].edificios[value][0];
    setPiso(p0);
  }

  function submit(e) {
    e.preventDefault();
    onAdd({ id, code, sede, edificio, piso });
    setId("");
    setCode("01");
  }

  return (
    <section className="card">
      <h2>Lockers</h2>
      <p className="muted">Crear lockers y asociarlos a sede, edificio y piso. También puedes activarlos/desactivarlos.</p>

      <form className="row4" onSubmit={submit}>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID (ej: LK-SD-2-05)" />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código visible (ej: 05)" />

        <select value={sede} onChange={(e) => handleSedeChange(e.target.value)}>
          {Object.keys(SEDES).map((k) => (
            <option key={k} value={k}>
              {SEDES[k].label}
            </option>
          ))}
        </select>

        <select value={edificio} onChange={(e) => handleEdificioChange(e.target.value)}>
          {edificiosDisponibles.map((ed) => (
            <option key={ed} value={ed}>
              {ed}
            </option>
          ))}
        </select>

        <select value={piso} onChange={(e) => setPiso(Number(e.target.value))}>
          {pisosDisponibles.map((p) => (
            <option key={p} value={p}>
              Piso {p}
            </option>
          ))}
        </select>

        <button type="submit">Crear locker</button>
      </form>

      <div className="table table-7">
        <div className="thead">
          <div>ID</div>
          <div>Código</div>
          <div>Sede</div>
          <div>Edificio</div>
          <div>Piso</div>
          <div>Estado</div>
          <div>Acción</div>
        </div>

        {lockers.map((l) => (
          <div className="trow" key={l.id}>
            <div>{l.id}</div>
            <div>{l.code}</div>
            <div>{SEDES[l.sede]?.label ?? l.sede}</div>
            <div>{l.edificio}</div>
            <div>{l.piso}</div>
            <div>
              <span className={`pill ${l.active ? "CONFIRMADA" : "CANCELADA"}`}>{l.active ? "ACTIVO" : "INACTIVO"}</span>
            </div>
            <div>
              <button onClick={() => onToggle(l.id)}>{l.active ? "Desactivar" : "Activar"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigView({ onReset, onExport, onImport }) {
  return (
    <section className="card">
      <h2>Configuración</h2>
      <p className="muted">Exporta/importa JSON y reinicia datos.</p>

      <div className="grid2">
        <div className="panel">
          <h3>Backup</h3>
          <p className="muted">Exporta o importa lockers y reservas.</p>
          <div className="row">
            <button onClick={onExport}>Exportar JSON</button>
            <label className="file">
              Importar JSON
              <input type="file" accept="application/json" onChange={(e) => onImport(e.target.files?.[0])} />
            </label>
          </div>
        </div>

        <div className="panel">
          <h3>Reiniciar</h3>
          <p className="muted">Restablece valores por defecto y borra reservas.</p>
          <button className="danger" onClick={onReset}>
            Reset total
          </button>
        </div>
      </div>
    </section>
  );
}