/* tenemos el import de CSS en main.jsx para que se aplique a toda la app, incluyendo vistas */
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

/* -------------------- Tipos y utilidades -------------------- */
const LS_KEYS = {
  lockers: "lockers_items_v1",
  reservations: "lockers_reservations_v1",
} as const;

/* acá tenemos todos los tipos de la app, para tenerlos centralizados y evitar "prop drilling" raro 
el prop drilling es cuando pasamos props de padre a hijo y de hijo a nieto, etc. 
los props son las propiedades que se pasan a los componentes de React para que puedan usarlas.*/

/* ViewKey es el tipo que define las vistas de la app, es decir, las diferentes pantallas que el usuario puede ver.
ToastType es el tipo que define los tipos de mensajes de notificación que se pueden mostrar al usuario (éxito, error, información).
ReservationStatus es el tipo que define los estados de una reserva (confirmada o cancelada).*/
type ViewKey = "dashboard" | "reservar" | "mis-reservas" | "lockers" | "config";
type ToastType = "success" | "error" | "info";
type ReservationStatus = "CONFIRMADA" | "CANCELADA";
/* SedeKey es el tipo que define las sedes disponibles en la app, en este caso "CENTRO" y "CAMPUS".*/
type SedeKey = "CENTRO" | "CAMPUS";

type Locker = {
  id: string;
  code: string;
  sede: SedeKey;
  edificio: string;
  piso: number;
  active: boolean;
};
/* Nota: en una app real probablemente separaríamos "Locker" y "LockerConfig", 
pero para este ejercicio mantenemos uno solo con "active" para simplificar. */
type Reservation = {
  id: string;
  lockerId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  user: string;
  reason: string;
  status: ReservationStatus;
  createdAt: string;
};

/* el Toast es un mensaje de notificación que se muestra al usuario, con un tipo (success, error, info) y un mensaje. */
type Toast = { type: ToastType; msg: string };

type SedeConfig = {
  label: string;
  edificios: Record<string, number[]>;
};

/**  Reglas de negocio: Sede -> Edificios -> Pisos */
const SEDES: Record<SedeKey, SedeConfig> = {
  CENTRO: {
    label: "Centro",
    edificios: {
      "Centro Histórico": [1, 2, 3],
    },
  },
  CAMPUS: {
    label: "Campus",
    edificios: {
      "Santo Domingo": [1, 2, 3, 4,5,6],
      "Giordano Bruno": [1, 2, 3,4],
    },
  },
};

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPastDate(dateISO: string): boolean {
  return dateISO < todayISO();
}

function prettyDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-");
  return `${d}/${m}/${y}`;
}

/** Lockers por defecto */
const DEFAULT_LOCKERS: Locker[] = [
  { id: "LK-CH-1-01", code: "01", sede: "CENTRO", edificio: "Centro Histórico", piso: 1, active: true },
  { id: "LK-CH-1-02", code: "02", sede: "CENTRO", edificio: "Centro Histórico", piso: 1, active: true },
  { id: "LK-SD-2-01", code: "01", sede: "CAMPUS", edificio: "Santo Domingo", piso: 2, active: true },
  { id: "LK-SD-2-02", code: "02", sede: "CAMPUS", edificio: "Santo Domingo", piso: 2, active: true },
  { id: "LK-GB-3-01", code: "01", sede: "CAMPUS", edificio: "Giordano Bruno", piso: 3, active: true },
];

export default function App() {
  //  Navegación SPA, controlada por el estado "view". No usamos React Router para mantenerlo simple y centrado en React puro.
  const [view, setView] = useState<ViewKey>("dashboard");

  //  Datos persistentes, cargados inicialmente desde localStorage o con valores por defecto si no hay nada guardado.
  const [lockers, setLockers] = useState<Locker[]>(() => loadLS(LS_KEYS.lockers, DEFAULT_LOCKERS));
  const [reservations, setReservations] = useState<Reservation[]>(() => loadLS(LS_KEYS.reservations, []));

  //  UI feedback, es decir, el mensaje que se muestra al usuario cuando realiza una acción (ej: "Reserva creada", "Locker desactivado", etc.)
  const [toast, setToast] = useState<Toast>({ type: "info", msg: "" });

  //  Persistencia automática, guardamos en localStorage cada vez que cambian los lockers o las reservas. 
  // Esto se hace con useEffect, que es un --hook de React-- que se ejecuta cuando cambian las dependencias 
  // (en este caso, lockers o reservations).
  useEffect(() => saveLS(LS_KEYS.lockers, lockers), [lockers]);
  useEffect(() => saveLS(LS_KEYS.reservations, reservations), [reservations]);

  // Helpers / derivados
  // recordemos que los hooks de React (como useMemo) deben ir en el nivel superior del componente, 
  // no dentro de condicionales ni funciones anidadas.
  // también recordemos que useMemo es un hook que nos permite memorizar el resultado de una función, 
  // es decir, evitar recalcularlo si las dependencias no han cambiado.
  // tener presente que los helpers son funciones o cálculos que dependen del estado y que nos ayudan 
  // a simplificar la lógica de renderizado o de otras funciones.
    const activeLockers = useMemo(() => lockers.filter((l) => l.active), [lockers]);

// stats es un objeto que contiene el total de reservas, las reservas de hoy y los lockers activos.
  const stats = useMemo(() => {
    const total = reservations.length;
    const today = reservations.filter((r) => r.date === todayISO()).length;
    const active = activeLockers.length;
    return { total, today, active };
  }, [reservations, activeLockers]);

// upcomingReservations es un array de las próximas reservas, ordenadas por fecha y hora, 
// y filtradas para mostrar solo las que son hoy o en el futuro.
// el slice(0, 6); es para mostrar solo las próximas 6 reservas, para no saturar el dashboard.
  const upcomingReservations = useMemo(() => {
    const sorted = [...reservations].sort((a, b) => {
      const A = `${a.date} ${a.start}`;
      const B = `${b.date} ${b.start}`;
      return A.localeCompare(B);
    });
    return sorted.filter((r) => r.date >= todayISO()).slice(0, 6);
  }, [reservations]);

 // notify es una función que se encarga de mostrar un mensaje de notificación al usuario, 
 // con un tipo (success, error, info) y un mensaje. 
  function notify(type: ToastType, msg: string) {
    setToast({ type, msg });

  // Guardamos timer en window para evitar "prop" rara en función
  // window es el objeto global del navegador, donde podemos guardar propiedades personalizadas, 
  // es decir, podemos crear una propiedad llamada __toastTimer 
  // para almacenar el ID del timer que se encarga de ocultar el mensaje después de un tiempo.
  // 2600 ms es un tiempo razonable para que el usuario pueda leer el mensaje antes de que desaparezca.
    const w = window as unknown as { __toastTimer?: number };
    if (w.__toastTimer) window.clearTimeout(w.__toastTimer);
    w.__toastTimer = window.setTimeout(() => setToast({ type: "info", msg: "" }), 2600);
  }

  // Validación de solapamiento: mismo locker + mismo día + cruce horario
  // solapamiento es cuando dos reservas se cruzan en el tiempo, es decir, que una empieza antes de que la otra termine y viceversa.
  function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    return aStart < bEnd && bStart < aEnd;
  }
// el payload es un objeto que contiene los datos necesarios para crear una reserva, 
// como el ID del locker, la fecha, la hora de inicio y fin, el usuario y el motivo.
  type CreateReservationPayload = {
    lockerId: string;
    date: string;
    start: string;
    end: string;
    user: string;
    reason: string;
  };

  // createReservation es una función que se encarga de crear una nueva reserva,
  function createReservation(payload: CreateReservationPayload) {
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

    const newR: Reservation = {
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

  // cancelReservation es una función que se encarga de cancelar una reserva existente, cambiando su estado a "CANCELADA".
  function cancelReservation(id: string) {
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "CANCELADA" } : r)));
    notify("info", "Reserva cancelada.");
  }

  // addLocker es una función que se encarga de crear un nuevo locker, con su ID, código, sede, edificio y piso.
  type AddLockerPayload = {
    id: string;
    code: string;
    sede: SedeKey;
    edificio: string;
    piso: number;
  };

  // esta función también valida que el ID sea único, que los campos no estén vacíos, 
  // y que la sede/edificio/piso sean válidos según las reglas definidas en SEDES.
  function addLocker({ id, code, sede, edificio, piso }: AddLockerPayload) {
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

  // toggleLocker es una función que se encarga de activar o desactivar un locker existente, cambiando su propiedad "active".
  // ...l es el operador de propagación, que nos permite crear un nuevo objeto con las mismas propiedades que el locker original, 
  // pero con la propiedad "active" invertida (si era true, pasa a false, y viceversa).
  // los 3 puntos son una forma de copiar un objeto o un array en JavaScript, y luego modificarlo sin mutar el original.
  function toggleLocker(id: string) {
    setLockers((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));
    notify("info", "Estado de locker actualizado.");
  }
  function deleteLocker(id: string) {
  if (!confirm("¿Seguro que deseas eliminar este locker?")) return;

  setLockers((prev) => prev.filter((l) => l.id !== id));
  notify("info", "Locker eliminado.");
  }
  function updateLocker(updated: Locker) {
  setLockers((prev) =>
    prev.map((l) => (l.id === updated.id ? updated : l))
  );

  notify("success", "Locker actualizado.");
  }

  // resetAll es una función que se encarga de reiniciar todos los datos de la app, 
  // volviendo a los lockers por defecto y borrando las reservas.
  function resetAll() {
    if (!confirm("¿Seguro? Esto borrará lockers/reservas y restablecerá valores por defecto.")) return;
    setLockers(DEFAULT_LOCKERS);
    setReservations([]);
    notify("success", "Datos reiniciados.");
    setView("dashboard");
  }
// exportJSON es una función que se encarga de exportar los datos de lockers y reservas en un archivo JSON,
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
// importJSON es una función que se encarga de importar los datos de lockers y reservas desde un archivo JSON,
  function importJSON(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { lockers: Locker[]; reservations: Reservation[] };
        if (!parsed.lockers || !parsed.reservations) throw new Error("Estructura inválida");

        // ✅ Sanitiza sede/edificio/piso para que cumpla reglas actuales
        const normalized: Locker[] = parsed.lockers.map((l) => {
  // 1) Normaliza "sede" desde JSON (puede venir mal)
  const rawSede = String((l as unknown as { sede?: string }).sede ?? "").toUpperCase();

  const sede: SedeKey = rawSede === "CENTRO" || rawSede === "CAMPUS" ? (rawSede as SedeKey) : "CAMPUS";

  // 2) Edificio válido para esa sede
  const edificios = SEDES[sede].edificios;

  const rawEdificio = String((l as unknown as { edificio?: string }).edificio ?? "");
  const edificio = Object.prototype.hasOwnProperty.call(edificios, rawEdificio)
    ? rawEdificio
    : Object.keys(edificios)[0];

  // 3) Piso válido para ese edificio
  const pisos = edificios[edificio];
  const rawPiso = Number((l as unknown as { piso?: number }).piso ?? NaN);
  const piso = pisos.includes(rawPiso) ? rawPiso : pisos[0];

  // 4) Construye Locker final tipado
  return {
    id: String((l as unknown as { id?: string }).id ?? "").trim().toUpperCase(),
    code: String((l as unknown as { code?: string }).code ?? "").trim(),
    sede,
    edificio,
    piso,
    active: Boolean((l as unknown as { active?: boolean }).active),
  };
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

  // lockerLabelById es una función que recibe un ID de locker y devuelve una etiqueta legible 
  // con su código y ubicación (sede, edificio, piso).
  // esta función se utiliza para mostrar la información del locker en las reservas, 
  // en lugar de mostrar solo el ID, que no es muy amigable para el usuario.
  function lockerLabelById(lockerId: string) {
    const l = lockers.find((x) => x.id === lockerId);
    if (!l) return lockerId;
    const sedeLbl = SEDES[l.sede]?.label ?? l.sede;
    return `Locker ${l.code} • ${sedeLbl} - ${l.edificio} • Piso ${l.piso}`;
  }
// la función lockerLabelById busca el locker correspondiente al ID dado, y si lo encuentra, 
// construye una etiqueta con su código y ubicación.
  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <div>
            <h1>Reserva de Lockers</h1>
            <p>SPA (Vite + React TS) • Sede/Edificio/Piso • Persistencia con localStorage</p>
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

        {view === "lockers" && (
          <LockersView
            lockers={lockers}
            onAdd={addLocker}
            onToggle={toggleLocker}
            onDelete={deleteLocker}
            onEdit={updateLocker}
          />
        )}

        {view === "config" && <ConfigView onReset={resetAll} onExport={exportJSON} onImport={importJSON} />}
      </main>

      <footer className="footer">
        <span>© 2026 • Lockers • Demo SPA</span>
      </footer>
    </div>
  );/* el return es lo que se renderiza en la pantalla, es decir, lo que el usuario ve.*/
}

/* -------------------- Vistas -------------------- */

/* cada vista es un componente separado, que recibe por props los datos y funciones que necesita para funcionar.*/
/*--ReserveView--  es el componente que se encarga de mostrar el formulario para crear una nueva reserva,
y de manejar la lógica de selección de sede/edificio/piso y locker disponible según esa ubicación. 
Recibe por props el array de lockers activos y la función onCreate para crear la reserva cuando se envía el formulario.*/
function ReserveView({
  lockers,
  onCreate,
}: {
  lockers: Locker[];
  onCreate: (payload: { lockerId: string; date: string; start: string; end: string; user: string; reason: string }) => void;
}) {
  //  Filtros jerárquicos: sede -> edificio -> piso -> locker
  const [sede, setSede] = useState<SedeKey>("CAMPUS");
  const [edificio, setEdificio] = useState<string>(Object.keys(SEDES.CAMPUS.edificios)[0]);
  const [piso, setPiso] = useState<number>(SEDES.CAMPUS.edificios[Object.keys(SEDES.CAMPUS.edificios)[0]][0]);

  const [lockerId, setLockerId] = useState<string>("");

  const [date, setDate] = useState<string>(todayISO());
  const [start, setStart] = useState<string>("08:00");
  const [end, setEnd] = useState<string>("09:00");
  const [user, setUser] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  //  Recalcula edificios/pisos cuando cambia sede
  const edificiosDisponibles = useMemo(() => Object.keys(SEDES[sede].edificios), [sede]);
  const pisosDisponibles = useMemo(() => SEDES[sede].edificios[edificio] ?? [], [sede, edificio]);

  //  Lockers disponibles según ubicación seleccionada
  const lockersFiltrados = useMemo(() => {
    return lockers
      .filter((l) => l.sede === sede)
      .filter((l) => l.edificio === edificio)
      .filter((l) => Number(l.piso) === Number(piso));
  }, [lockers, sede, edificio, piso]);

  //  Locker “efectivo” sin useEffect, decir que si el lockerId seleccionado no está en lockersFiltrados, 
  // se resetea a "" o al primer locker disponible.
  const effectiveLockerId = lockerId || lockersFiltrados[0]?.id || "";

  //  Handlers de cambio de ubicación, que resetean los filtros inferiores y el locker seleccionado.
  // un handler es una función que se ejecuta cuando ocurre un evento, como un cambio en un select o un submit en un formulario.
  function onChangeSede(value: SedeKey) {
    setSede(value);
    const ed0 = Object.keys(SEDES[value].edificios)[0];
    setEdificio(ed0);
    const p0 = SEDES[value].edificios[ed0][0];
    setPiso(p0);
    setLockerId("");
  }
// cuando se cambia la sede, se actualiza el estado de "sede" con el nuevo valor, 
// luego se obtiene el primer edificio disponible para esa sede y se actualiza el estado de "edificio",
  function onChangeEdificio(value: string) {
    setEdificio(value);
    const p0 = SEDES[sede].edificios[value][0];
    setPiso(p0);
    setLockerId("");
  }
// cuando se cambia el edificio, se actualiza el estado de "edificio" con el nuevo valor,
  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCreate({ lockerId: effectiveLockerId, date, start, end, user, reason });
  }
// el submit es la función que se ejecuta cuando se envía el formulario, 
// y se encarga de llamar a la función onCreate con los datos necesarios para crear la reserva.
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
              <select value={sede} onChange={(e) => onChangeSede(e.target.value as SedeKey)}>
                {(Object.keys(SEDES) as SedeKey[]).map((k) => (
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
              <select
                value={piso}
                onChange={(e) => {
                  setPiso(Number(e.target.value));
                  setLockerId("");
                }}
              >
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
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ej: Guardar implementos de laboratorio"
              required
            />
          </label>

          <button type="submit" disabled={!effectiveLockerId}>
            Confirmar reserva
          </button>
        </form>
      )}
    </section>
  );
}

// MyReservationsView es el componente que se encarga de mostrar las reservas del usuario, 
// con opciones para filtrar por texto y por estado (solo confirmadas o todas),
function MyReservationsView({
  reservations,
  onCancel,
  lockers,
}: {
  reservations: Reservation[];
  onCancel: (id: string) => void;
  lockers: Locker[];
}) {
  const [q, setQ] = useState<string>("");
  const [onlyActive, setOnlyActive] = useState<boolean>(true);

  function lockerLabel(id: string) {
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
      <p className="muted">Filtra por usuario/motivo/fecha o ubicación. Puedes ocultar canceladas con “Solo confirmadas”.</p>

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
// LockersView es el componente que se encarga de mostrar la lista de lockers, 
// con un formulario para crear nuevos lockers y botones para activar/desactivar cada locker.
function LockersView({
  lockers,
  onAdd,
  onToggle,
  onDelete,
  onEdit,
}: {
  lockers: Locker[];
  onAdd: (payload: { id: string; code: string; sede: SedeKey; edificio: string; piso: number }) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (locker: Locker) => void;
}) {

  const [editingLocker, setEditingLocker] = useState<Locker | null>(null);

  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [sede, setSede] = useState<SedeKey>("CAMPUS");
  const [edificio, setEdificio] = useState(Object.keys(SEDES.CAMPUS.edificios)[0]);
  const [piso, setPiso] = useState<number>(SEDES.CAMPUS.edificios[Object.keys(SEDES.CAMPUS.edificios)[0]][0]);

  const edificiosDisponibles = Object.keys(SEDES[sede].edificios);
  const pisosDisponibles = SEDES[sede].edificios[edificio];

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (editingLocker) {
      onEdit({
        id,
        code,
        sede,
        edificio,
        piso,
        active: editingLocker.active,
      });

      setEditingLocker(null);
    } else {
      onAdd({
        id,
        code,
        sede,
        edificio,
        piso,
      });
    }

    setId("");
    setCode("");
  }

  return (
    <section className="card">
      <h2>Gestión de Lockers</h2>

      <form className="stack" onSubmit={submit}>

        <div className="row3-wide">

          <label>
            ID
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Ej: LK-SD-1-01"
              required
            />
          </label>

          <label>
            Código
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ej: 01"
              required
            />
          </label>

          <label>
            Sede
            <select
              value={sede}
              onChange={(e) => {
                const value = e.target.value as SedeKey;
                setSede(value);
                const ed0 = Object.keys(SEDES[value].edificios)[0];
                setEdificio(ed0);
                setPiso(SEDES[value].edificios[ed0][0]);
              }}
            >
              {(Object.keys(SEDES) as SedeKey[]).map((k) => (
                <option key={k} value={k}>
                  {SEDES[k].label}
                </option>
              ))}
            </select>
          </label>

        </div>

        <div className="row3-wide">

          <label>
            Edificio
            <select
              value={edificio}
              onChange={(e) => {
                const value = e.target.value;
                setEdificio(value);
                setPiso(SEDES[sede].edificios[value][0]);
              }}
            >
              {edificiosDisponibles.map((ed) => (
                <option key={ed} value={ed}>
                  {ed}
                </option>
              ))}
            </select>
          </label>

          <label>
            Piso
            <select
              value={piso}
              onChange={(e) => setPiso(Number(e.target.value))}
            >
              {pisosDisponibles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

        </div>

        <button type="submit">
          {editingLocker ? "Guardar cambios" : "Crear locker"}
        </button>

        {editingLocker && (
          <button
            type="button"
            onClick={() => {
              setEditingLocker(null);
              setId("");
              setCode("");
            }}
          >
            Cancelar edición
          </button>
        )}

      </form>

      <hr className="hr" />

      <div className="table table-6">
        <div className="thead">
          <div>ID</div>
          <div>Código</div>
          <div>Sede</div>
          <div>Edificio</div>
          <div>Piso</div>
          <div>Acciones</div>
        </div>

        {lockers.map((l) => (
          <div className="trow" key={l.id}>
            <div>{l.id}</div>
            <div>{l.code}</div>
            <div>{SEDES[l.sede].label}</div>
            <div>{l.edificio}</div>
            <div>{l.piso}</div>

            <div className="actions">

              <button
                onClick={() => {
                  setEditingLocker(l);
                  setId(l.id);
                  setCode(l.code);
                  setSede(l.sede);
                  setEdificio(l.edificio);
                  setPiso(l.piso);
                }}
              >
                Editar
              </button>

              <button onClick={() => onToggle(l.id)}>
                {l.active ? "Desactivar" : "Activar"}
              </button>

              <button onClick={() => onDelete(l.id)}>
                Eliminar
              </button>

            </div>
          </div>
        ))}

      </div>
    </section>
  );
}
// ConfigView es el componente que se encarga de mostrar las opciones de configuración, 
// como exportar/importar datos en JSON y reiniciar la app a su estado inicial.
function ConfigView({
  onReset,
  onExport,
  onImport,
}: {
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File | undefined) => void;
}) {
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