import React, { useEffect, useMemo, useRef, useState } from "react";

const RAMPS = ["Ramp A", "Ramp B", "Ramp C"];
const OPEN_START = 8 * 60;
const OPEN_END = 18 * 60;
const SLOT = 30;

const timeToMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const rangesOverlap = (startA, endA, startB, endB) =>
  startA < endB && endA > startB;

const todayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const buildSlots = () => {
  const slots = [];
  for (let t = OPEN_START; t < OPEN_END; t += SLOT) {
    slots.push({ start: t, end: t + SLOT });
  }
  return slots;
};

const SLOT_LIST = buildSlots();

const initialBookings = (date) => [
  {
    id: crypto.randomUUID(),
    ramp: "Ramp A",
    date,
    start: "09:00",
    end: "11:00",
    name: "Sam Taylor",
    registration: "AB12 CDE",
    source: "admin",
  },
  {
    id: crypto.randomUUID(),
    ramp: "Ramp B",
    date,
    start: "10:30",
    end: "12:00",
    name: "Riya Patel",
    registration: "PK19 ZYU",
    source: "admin",
  },
];

export default function App() {
  const [view, setView] = useState("customer");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [bookings, setBookings] = useState(() => initialBookings(todayISO()));
  const [adminForm, setAdminForm] = useState(null);
  const [dragState, setDragState] = useState(null);
  const rowWidthRef = useRef(0);
  const rowHeightRef = useRef(60);
  const gridRef = useRef(null);
  const dragMovedRef = useRef(false);

  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate),
    [bookings, selectedDate]
  );

  const availableSlots = useMemo(() => {
    return SLOT_LIST.filter((slot) => {
      return RAMPS.some((ramp) => {
        const rampBookings = dayBookings.filter((b) => b.ramp === ramp);
        return !rampBookings.some((b) => {
          const bStart = timeToMinutes(b.start);
          const bEnd = timeToMinutes(b.end);
          return rangesOverlap(slot.start, slot.end, bStart, bEnd);
        });
      });
    });
  }, [dayBookings]);

  const refreshRowMetrics = () => {
    if (!gridRef.current) return;
    const row = gridRef.current.querySelector(".diary-row");
    if (!row) return;
    rowWidthRef.current = row.getBoundingClientRect().width;
    rowHeightRef.current = row.getBoundingClientRect().height;
  };

  useEffect(() => {
    refreshRowMetrics();
    window.addEventListener("resize", refreshRowMetrics);
    return () => window.removeEventListener("resize", refreshRowMetrics);
  }, [view]);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (event) => {
      event.preventDefault();
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragMovedRef.current = true;
      }
      const minutesPerPixel =
        rowWidthRef.current === 0
          ? 0
          : (OPEN_END - OPEN_START) / rowWidthRef.current;
      const deltaMinutes = Math.round(deltaX * minutesPerPixel / SLOT) * SLOT;
      const rampShift = Math.round(deltaY / rowHeightRef.current);

      setBookings((current) => {
        const updated = current.map((b) => {
          if (b.id !== dragState.booking.id) return b;

          const originalStart = timeToMinutes(dragState.booking.start);
          const originalEnd = timeToMinutes(dragState.booking.end);
          let nextStart = originalStart;
          let nextEnd = originalEnd;
          let nextRamp = dragState.booking.ramp;

          if (dragState.mode === "move") {
            nextStart = clamp(
              originalStart + deltaMinutes,
              OPEN_START,
              OPEN_END - (originalEnd - originalStart)
            );
            nextEnd = nextStart + (originalEnd - originalStart);
            const rampIndex = RAMPS.indexOf(dragState.booking.ramp);
            const nextIndex = clamp(
              rampIndex + rampShift,
              0,
              RAMPS.length - 1
            );
            nextRamp = RAMPS[nextIndex];
          }

          if (dragState.mode === "resize-start") {
            nextStart = clamp(
              originalStart + deltaMinutes,
              OPEN_START,
              originalEnd - SLOT
            );
          }

          if (dragState.mode === "resize-end") {
            nextEnd = clamp(
              originalEnd + deltaMinutes,
              originalStart + SLOT,
              OPEN_END
            );
          }

          const nextBooking = {
            ...b,
            ramp: nextRamp,
            start: minutesToTime(nextStart),
            end: minutesToTime(nextEnd),
          };

          const hasConflict = current.some((other) => {
            if (other.id === b.id) return false;
            if (other.date !== b.date) return false;
            if (other.ramp !== nextBooking.ramp) return false;
            const oStart = timeToMinutes(other.start);
            const oEnd = timeToMinutes(other.end);
            return rangesOverlap(nextStart, nextEnd, oStart, oEnd);
          });

          if (hasConflict) return b;
          return nextBooking;
        });
        return updated;
      });
    };

    const handleUp = () => {
      setDragState(null);
      dragMovedRef.current = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState]);

  const handleCustomerBooking = (slot) => {
    const ramp = RAMPS.find((candidate) => {
      const rampBookings = dayBookings.filter((b) => b.ramp === candidate);
      return !rampBookings.some((b) => {
        const bStart = timeToMinutes(b.start);
        const bEnd = timeToMinutes(b.end);
        return rangesOverlap(slot.start, slot.end, bStart, bEnd);
      });
    });

    if (!ramp) return;

    const newBooking = {
      id: crypto.randomUUID(),
      ramp,
      date: selectedDate,
      start: minutesToTime(slot.start),
      end: minutesToTime(slot.end),
      name: "Customer booking",
      registration: "-",
      source: "customer",
    };

    setBookings((current) => [...current, newBooking]);
  };

  const handleRowClick = (event, ramp) => {
    if (event.target.closest(".booking-card")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = clamp(x / rect.width, 0, 0.999);
    const slotIndex = Math.floor(ratio * SLOT_LIST.length);
    const startMinutes = OPEN_START + slotIndex * SLOT;

    setAdminForm({
      ramp,
      date: selectedDate,
      start: minutesToTime(startMinutes),
      duration: 30,
      name: "",
      registration: "",
    });
  };

  const handleAdminCreate = () => {
    if (!adminForm) return;
    const startMinutes = timeToMinutes(adminForm.start);
    const endMinutes = startMinutes + adminForm.duration;

    const hasConflict = bookings.some((b) => {
      if (b.date !== adminForm.date) return false;
      if (b.ramp !== adminForm.ramp) return false;
      return rangesOverlap(
        startMinutes,
        endMinutes,
        timeToMinutes(b.start),
        timeToMinutes(b.end)
      );
    });

    if (endMinutes > OPEN_END || startMinutes < OPEN_START || hasConflict) {
      alert("That slot conflicts or is outside opening hours.");
      return;
    }

    const newBooking = {
      id: crypto.randomUUID(),
      ramp: adminForm.ramp,
      date: adminForm.date,
      start: adminForm.start,
      end: minutesToTime(endMinutes),
      name: adminForm.name || "Walk-in",
      registration: adminForm.registration || "-",
      source: "admin",
    };

    setBookings((current) => [...current, newBooking]);
    setAdminForm(null);
  };

  const handleDelete = (booking) => {
    if (!window.confirm("Delete this booking?")) return;
    setBookings((current) => current.filter((b) => b.id !== booking.id));
  };

  const startDrag = (event, booking, mode) => {
    event.preventDefault();
    event.stopPropagation();
    dragMovedRef.current = false;
    setDragState({
      booking,
      mode,
      startX: event.clientX,
      startY: event.clientY,
    });
  };

  const timeOptions = SLOT_LIST.map((slot) => minutesToTime(slot.start));

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div className="tabs">
            <button
              className={view === "customer" ? "active" : ""}
              onClick={() => setView("customer")}
            >
              Customer booking
            </button>
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              Admin diary
            </button>
          </div>
        </div>

        {view === "customer" ? (
          <div className="customer-view">
            <div className="date-row">
              <label>
                Date
                <input
                  type="date"
                  value={selectedDate}
                  min={todayISO()}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
              <span className="hours">Opening hours 08:00–18:00</span>
            </div>
            <div className="step">
              <h2>Available times</h2>
              <p className="subtle">
                Each slot represents at least one free ramp. Click to book.
              </p>
              <div className="slot-list">
                {availableSlots.length === 0 && (
                  <div className="empty">No availability on this day.</div>
                )}
                {availableSlots.map((slot) => (
                  <button
                    key={`${slot.start}-${slot.end}`}
                    className="slot"
                    onClick={() => handleCustomerBooking(slot)}
                  >
                    {minutesToTime(slot.start)} – {minutesToTime(slot.end)}
                  </button>
                ))}
              </div>
            </div>
            <div className="step">
              <h2>Confirmation</h2>
              <p className="subtle">
                Bookings appear below as you click a time slot.
              </p>
              <div className="confirmation-list">
                {dayBookings
                  .filter((b) => b.source === "customer")
                  .map((b) => (
                    <div key={b.id} className="confirmation-card">
                      Booked for {b.start}–{b.end}
                    </div>
                  ))}
                {dayBookings.filter((b) => b.source === "customer").length ===
                  0 && <div className="empty">No customer bookings yet.</div>}
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-view">
            <div className="date-row">
              <label>
                Date
                <input
                  type="date"
                  value={selectedDate}
                  min={todayISO()}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
              <span className="hours">Opening hours 08:00–18:00</span>
            </div>
            {adminForm && (
              <div className="admin-form">
                <div>
                  <h2>Create booking</h2>
                  <p className="subtle">
                    Ramp {adminForm.ramp} • {adminForm.date}
                  </p>
                </div>
                <div className="form-grid">
                  <label>
                    Customer name
                    <input
                      type="text"
                      value={adminForm.name}
                      onChange={(event) =>
                        setAdminForm({
                          ...adminForm,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Registration
                    <input
                      type="text"
                      value={adminForm.registration}
                      onChange={(event) =>
                        setAdminForm({
                          ...adminForm,
                          registration: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Start time
                    <select
                      value={adminForm.start}
                      onChange={(event) =>
                        setAdminForm({
                          ...adminForm,
                          start: event.target.value,
                        })
                      }
                    >
                      {timeOptions.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Duration
                    <select
                      value={adminForm.duration}
                      onChange={(event) =>
                        setAdminForm({
                          ...adminForm,
                          duration: Number(event.target.value),
                        })
                      }
                    >
                      {[30, 60, 90, 120].map((mins) => (
                        <option key={mins} value={mins}>
                          {mins} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary" onClick={handleAdminCreate}>
                    Save booking
                  </button>
                  <button onClick={() => setAdminForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            <div className="diary" ref={gridRef}>
              <div className="diary-header">
                <div className="ramp-label" />
                <div className="time-grid">
                  {SLOT_LIST.map((slot) => (
                    <div key={slot.start} className="time-cell">
                      {minutesToTime(slot.start)}
                    </div>
                  ))}
                </div>
              </div>

              {RAMPS.map((ramp) => (
                <div key={ramp} className="diary-row">
                  <div className="ramp-label">{ramp}</div>
                  <div
                    className="time-grid row-grid"
                    onClick={(event) => handleRowClick(event, ramp)}
                  >
                    {SLOT_LIST.map((slot) => (
                      <div key={slot.start} className="slot-cell" />
                    ))}
                    {dayBookings
                      .filter((b) => b.ramp === ramp)
                      .map((booking) => {
                        const startMin = timeToMinutes(booking.start);
                        const endMin = timeToMinutes(booking.end);
                        const left =
                          ((startMin - OPEN_START) /
                            (OPEN_END - OPEN_START)) *
                          100;
                        const width =
                          ((endMin - startMin) / (OPEN_END - OPEN_START)) * 100;

                        return (
                          <div
                            key={booking.id}
                            className={`booking-card ${booking.source}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            onMouseDown={(event) =>
                              startDrag(event, booking, "move")
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (dragMovedRef.current) return;
                              handleDelete(booking);
                            }}
                          >
                            <div
                              className="resize-handle left"
                              onMouseDown={(event) =>
                                startDrag(event, booking, "resize-start")
                              }
                            />
                            <div className="booking-info">
                              <strong>{booking.name}</strong>
                              <span>{booking.registration}</span>
                              <span>
                                {booking.start}–{booking.end}
                              </span>
                            </div>
                            <div
                              className="resize-handle right"
                              onMouseDown={(event) =>
                                startDrag(event, booking, "resize-end")
                              }
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="legend">
              <span className="dot admin" /> Admin booking
              <span className="dot customer" /> Customer booking
              <span className="hint">
                Drag bookings to move or change ramps. Drag edges to resize.
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
