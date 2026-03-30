"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Event {
	id: string;
	title: string;
	description: string | null;
	start_time: string;
	end_time: string;
	entry_fee: string;
	max_players: number;
	registered_count: number;
}

interface Registration {
	id: string;
	customer_id: string;
	customer_name: string;
	payment_status: "paid" | "pending";
	registered_at: string;
}

interface EventDetail {
	event: Event;
	registrations: Registration[];
}

interface Customer {
	id: string;
	name: string;
	email: string;
	store_credit_balance: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysInMonth(year: number, month: number) {
	return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
	return new Date(year, month, 1).getDay(); // 0 = Sunday
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
	const today = new Date();
	const [year, setYear] = useState(today.getFullYear());
	const [month, setMonth] = useState(today.getMonth());

	// Events keyed by date string "YYYY-MM-DD"
	const [eventsByDay, setEventsByDay] = useState<Record<string, Event[]>>({});
	const [loadingEvents, setLoadingEvents] = useState(false);

	// Selected day
	const [selectedDay, setSelectedDay] = useState<string | null>(null);

	// Event detail modal
	const [detail, setDetail] = useState<EventDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);

	// Create event modal
	const [createOpen, setCreateOpen] = useState(false);
	const [createForm, setCreateForm] = useState({
		title: "",
		description: "",
		start_time: "",
		end_time: "",
		entry_fee: "0",
		max_players: "0",
	});
	const [createError, setCreateError] = useState<string | null>(null);
	const [createSaving, setCreateSaving] = useState(false);

	// Register modal
	const [registerOpen, setRegisterOpen] = useState(false);
	const [customerSearch, setCustomerSearch] = useState("");
	const [customerResults, setCustomerResults] = useState<Customer[]>([]);
	const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
	const [payWithCredit, setPayWithCredit] = useState(false);
	const [registerError, setRegisterError] = useState<string | null>(null);
	const [registerSaving, setRegisterSaving] = useState(false);

	// ── Fetch events for the visible month ──────────────────────────────────────

	useEffect(() => {
		setLoadingEvents(true);
		const from = new Date(year, month, 1).toISOString();
		const to = new Date(year, month + 1, 1).toISOString();
		fetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
			credentials: "include",
		})
			.then((r) => r.json())
			.then((events: Event[]) => {
				const map: Record<string, Event[]> = {};
				for (const event of events) {
					const day = event.start_time.slice(0, 10);
					if (!map[day]) map[day] = [];
					map[day].push(event);
				}
				setEventsByDay(map);
			})
			.catch(() => {})
			.finally(() => setLoadingEvents(false));
	}, [year, month]);

	// ── Customer search (debounced) ──────────────────────────────────────────────

	useEffect(() => {
		if (!customerSearch.trim()) {
			setCustomerResults([]);
			return;
		}
		const timer = setTimeout(() => {
			fetch(`/api/customers?q=${encodeURIComponent(customerSearch.trim())}`, {
				credentials: "include",
			})
				.then((r) => r.json())
				.then(setCustomerResults)
				.catch(() => {});
		}, 250);
		return () => clearTimeout(timer);
	}, [customerSearch]);

	// ── Load event detail ────────────────────────────────────────────────────────

	async function openDetail(event: Event) {
		setDetailLoading(true);
		setDetail(null);
		try {
			const r = await fetch(`/api/events/${event.id}`, { credentials: "include" });
			const data = await r.json();
			setDetail(data);
		} catch {
			// ignore
		} finally {
			setDetailLoading(false);
		}
	}

	// ── Create event ─────────────────────────────────────────────────────────────

	async function handleCreate() {
		setCreateSaving(true);
		setCreateError(null);
		try {
			const r = await fetch("/api/events", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: createForm.title,
					description: createForm.description || null,
					start_time: new Date(createForm.start_time).toISOString(),
					end_time: new Date(createForm.end_time).toISOString(),
					entry_fee: parseFloat(createForm.entry_fee),
					max_players: parseInt(createForm.max_players, 10),
				}),
			});
			const data = await r.json();
			if (r.ok) {
				setCreateOpen(false);
				setCreateForm({ title: "", description: "", start_time: "", end_time: "", entry_fee: "0", max_players: "0" });
				// Refresh month
				setYear((y) => y);
				setMonth((m) => m);
				// Trigger re-fetch by toggling year/month
				setEventsByDay({});
				const from = new Date(year, month, 1).toISOString();
				const to = new Date(year, month + 1, 1).toISOString();
				fetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: "include" })
					.then((res) => res.json())
					.then((events: Event[]) => {
						const map: Record<string, Event[]> = {};
						for (const event of events) {
							const day = event.start_time.slice(0, 10);
							if (!map[day]) map[day] = [];
							map[day].push(event);
						}
						setEventsByDay(map);
					})
					.catch(() => {});
			} else {
				setCreateError(data.error ?? "Failed to create event");
			}
		} catch {
			setCreateError("Could not reach server");
		} finally {
			setCreateSaving(false);
		}
	}

	// ── Register customer ────────────────────────────────────────────────────────

	async function handleRegister() {
		if (!detail || !selectedCustomer) return;
		setRegisterSaving(true);
		setRegisterError(null);
		try {
			const r = await fetch(`/api/events/${detail.event.id}/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					customer_id: selectedCustomer.id,
					pay_with_credit: payWithCredit,
				}),
			});
			const data = await r.json();
			if (r.ok) {
				setRegisterOpen(false);
				setSelectedCustomer(null);
				setCustomerSearch("");
				setPayWithCredit(false);
				// Refresh detail
				openDetail(detail.event);
			} else {
				setRegisterError(data.error ?? "Registration failed");
			}
		} catch {
			setRegisterError("Could not reach server");
		} finally {
			setRegisterSaving(false);
		}
	}

	// ── Calendar grid math ───────────────────────────────────────────────────────

	const totalDays = daysInMonth(year, month);
	const startOffset = firstDayOfMonth(year, month);
	const days = Array.from({ length: totalDays }, (_, i) => i + 1);

	function prevMonth() {
		if (month === 0) { setYear((y) => y - 1); setMonth(11); }
		else setMonth((m) => m - 1);
	}
	function nextMonth() {
		if (month === 11) { setYear((y) => y + 1); setMonth(0); }
		else setMonth((m) => m + 1);
	}

	function toDateKey(day: number) {
		return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}

	const eventsForSelectedDay = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

	// ── Render ───────────────────────────────────────────────────────────────────

	return (
		<div className="flex gap-6 h-full">
			{/* ── Calendar ──────────────────────────────────────────────────── */}
			<div className="flex-1 min-w-0">
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-[#fabd2f] font-mono text-2xl font-bold">
						Calendar
					</h1>
					<div className="flex items-center gap-3">
						{loadingEvents && (
							<span className="text-[#928374] font-mono text-xs">Loading…</span>
						)}
						<button
							onClick={() => {
								setCreateForm({ title: "", description: "", start_time: "", end_time: "", entry_fee: "0", max_players: "0" });
								setCreateError(null);
								setCreateOpen(true);
							}}
							className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
						>
							+ New Event
						</button>
					</div>
				</div>

				{/* Month navigation */}
				<div className="flex items-center gap-4 mb-4">
					<button
						onClick={prevMonth}
						className="text-[#928374] hover:text-[#ebdbb2] font-mono text-sm transition-colors"
					>
						← Prev
					</button>
					<span className="text-[#ebdbb2] font-mono font-bold min-w-[12rem] text-center">
						{MONTH_NAMES[month]} {year}
					</span>
					<button
						onClick={nextMonth}
						className="text-[#928374] hover:text-[#ebdbb2] font-mono text-sm transition-colors"
					>
						Next →
					</button>
					<button
						onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
						className="text-[#83a598] hover:text-[#ebdbb2] font-mono text-xs transition-colors"
					>
						Today
					</button>
				</div>

				{/* Day-of-week headers */}
				<div className="grid grid-cols-7 border border-[#3c3836] border-b-0">
					{DAY_NAMES.map((d) => (
						<div
							key={d}
							className="text-center text-[#a89984] font-mono text-xs py-2 border-b border-[#3c3836] bg-[#1d2021]"
						>
							{d}
						</div>
					))}
				</div>

				{/* Day grid */}
				<div className="grid grid-cols-7 border-l border-[#3c3836]">
					{/* Empty cells before month start */}
					{Array.from({ length: startOffset }).map((_, i) => (
						<div
							key={`empty-${i}`}
							className="border-r border-b border-[#3c3836] bg-[#1d2021] min-h-[80px]"
						/>
					))}

					{/* Day cells */}
					{days.map((day) => {
						const key = toDateKey(day);
						const events = eventsByDay[key] ?? [];
						const isToday =
							day === today.getDate() &&
							month === today.getMonth() &&
							year === today.getFullYear();
						const isSelected = key === selectedDay;

						return (
							<div
								key={day}
								onClick={() => setSelectedDay(isSelected ? null : key)}
								className={`border-r border-b border-[#3c3836] min-h-[80px] p-1 cursor-pointer transition-colors ${
									isSelected
										? "bg-[#3c3836]"
										: "hover:bg-[#32302f]"
								}`}
							>
								<div
									className={`font-mono text-xs mb-1 w-6 h-6 flex items-center justify-center ${
										isToday
											? "bg-[#fabd2f] text-[#282828] font-bold rounded-full"
											: "text-[#a89984]"
									}`}
								>
									{day}
								</div>
								<div className="space-y-0.5">
									{events.slice(0, 3).map((ev) => (
										<div
											key={ev.id}
											onClick={(e) => { e.stopPropagation(); openDetail(ev); }}
											className="text-[#b8bb26] font-mono text-xs truncate px-1 hover:bg-[#504945] transition-colors rounded"
											title={ev.title}
										>
											{ev.title}
										</div>
									))}
									{events.length > 3 && (
										<div className="text-[#665c54] font-mono text-xs px-1">
											+{events.length - 3} more
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* ── Day panel ─────────────────────────────────────────────────── */}
			{selectedDay && (
				<div className="w-72 border border-[#3c3836] bg-[#1d2021] flex flex-col shrink-0">
					<div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3836]">
						<h2 className="text-[#fabd2f] font-mono font-bold text-sm">
							{selectedDay}
						</h2>
						<button
							onClick={() => setSelectedDay(null)}
							className="text-[#928374] hover:text-[#ebdbb2] font-mono text-xs"
						>
							✕
						</button>
					</div>
					<div className="flex-1 overflow-y-auto px-4 py-3">
						{eventsForSelectedDay.length === 0 ? (
							<p className="text-[#665c54] font-mono text-sm">No events.</p>
						) : (
							<ul className="space-y-2">
								{eventsForSelectedDay.map((ev) => (
									<li key={ev.id}>
										<button
											onClick={() => openDetail(ev)}
											className="w-full text-left border border-[#3c3836] px-3 py-2 hover:bg-[#3c3836] transition-colors"
										>
											<p className="text-[#ebdbb2] font-mono text-sm font-bold truncate">
												{ev.title}
											</p>
											<p className="text-[#928374] font-mono text-xs">
												{new Date(ev.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
												{ev.entry_fee !== "0.00" && ` · $${parseFloat(ev.entry_fee).toFixed(2)}`}
											</p>
											<p className="text-[#665c54] font-mono text-xs">
												{ev.registered_count}
												{ev.max_players > 0 ? `/${ev.max_players}` : ""} registered
											</p>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}

			{/* ── Event detail modal ────────────────────────────────────────── */}
			{(detail || detailLoading) && (
				<div
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => { if (e.target === e.currentTarget) { setDetail(null); } }}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-lg max-h-[80vh] flex flex-col">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">
								{detailLoading ? "Loading…" : detail?.event.title}
							</h2>
							<button
								onClick={() => setDetail(null)}
								className="text-[#928374] hover:text-[#ebdbb2] font-mono"
							>
								✕
							</button>
						</div>

						{detailLoading ? (
							<p className="text-[#928374] font-mono text-sm px-5 py-4">Loading…</p>
						) : detail ? (
							<div className="flex-1 overflow-y-auto">
								{/* Event info */}
								<div className="px-5 py-4 border-b border-[#3c3836] space-y-1">
									{detail.event.description && (
										<p className="text-[#a89984] font-mono text-sm">{detail.event.description}</p>
									)}
									<p className="text-[#928374] font-mono text-xs">
										{new Date(detail.event.start_time).toLocaleString()} – {new Date(detail.event.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
									</p>
									<div className="flex gap-4 pt-1">
										<span className="text-[#b8bb26] font-mono text-sm">
											${parseFloat(detail.event.entry_fee).toFixed(2)} entry
										</span>
										<span className="text-[#83a598] font-mono text-sm">
											{detail.event.registered_count}
											{detail.event.max_players > 0 ? `/${detail.event.max_players}` : ""} players
										</span>
									</div>
								</div>

								{/* Registrations list */}
								<div className="px-5 py-4 border-b border-[#3c3836]">
									<p className="text-[#a89984] font-mono text-xs uppercase tracking-wider mb-3">
										Registrations
									</p>
									{detail.registrations.length === 0 ? (
										<p className="text-[#665c54] font-mono text-xs">No registrations yet.</p>
									) : (
										<ul className="space-y-1">
											{detail.registrations.map((reg) => (
												<li key={reg.id} className="flex items-center justify-between">
													<span className="text-[#ebdbb2] font-mono text-sm">{reg.customer_name}</span>
													<span
														className={`font-mono text-xs ${
															reg.payment_status === "paid"
																? "text-[#b8bb26]"
																: "text-[#fe8019]"
														}`}
													>
														{reg.payment_status}
													</span>
												</li>
											))}
										</ul>
									)}
								</div>

								{/* Register button */}
								<div className="px-5 py-4">
									<button
										onClick={() => {
											setRegisterError(null);
											setSelectedCustomer(null);
											setCustomerSearch("");
											setPayWithCredit(false);
											setRegisterOpen(true);
										}}
										className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
									>
										+ Register Customer
									</button>
								</div>
							</div>
						) : null}
					</div>
				</div>
			)}

			{/* ── Create event modal ────────────────────────────────────────── */}
			{createOpen && (
				<div
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">New Event</h2>
							<button onClick={() => setCreateOpen(false)} className="text-[#928374] hover:text-[#ebdbb2] font-mono">✕</button>
						</div>
						<div className="px-5 py-4 space-y-3">
							{(
								[
									{ label: "Title", key: "title", type: "text" },
									{ label: "Description", key: "description", type: "text" },
									{ label: "Start", key: "start_time", type: "datetime-local" },
									{ label: "End", key: "end_time", type: "datetime-local" },
									{ label: "Entry Fee ($)", key: "entry_fee", type: "number" },
									{ label: "Max Players (0 = unlimited)", key: "max_players", type: "number" },
								] as const
							).map(({ label, key, type }) => (
								<div key={key}>
									<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
										{label}
									</label>
									<input
										type={type}
										value={createForm[key]}
										onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
										className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors"
									/>
								</div>
							))}
							{createError && (
								<p className="text-[#fb4934] font-mono text-xs">{createError}</p>
							)}
							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={() => setCreateOpen(false)}
									className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2]"
								>
									Cancel
								</button>
								<button
									onClick={handleCreate}
									disabled={createSaving || !createForm.title.trim() || !createForm.start_time || !createForm.end_time}
									className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
								>
									{createSaving ? "Saving…" : "Create"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ── Register customer modal ───────────────────────────────────── */}
			{registerOpen && detail && (
				<div
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => { if (e.target === e.currentTarget) setRegisterOpen(false); }}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">Register Customer</h2>
							<button onClick={() => setRegisterOpen(false)} className="text-[#928374] hover:text-[#ebdbb2] font-mono">✕</button>
						</div>
						<div className="px-5 py-4 space-y-3">
							{/* Customer search */}
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Customer
								</label>
								<input
									type="text"
									value={customerSearch}
									onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
									placeholder="Search by name or email…"
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors placeholder:text-[#665c54]"
								/>
								{customerResults.length > 0 && !selectedCustomer && (
									<ul className="border border-[#504945] border-t-0 bg-[#1d2021]">
										{customerResults.map((c) => (
											<li
												key={c.id}
												onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); setCustomerResults([]); }}
												className="px-3 py-2 font-mono text-sm text-[#ebdbb2] hover:bg-[#3c3836] cursor-pointer"
											>
												{c.name} <span className="text-[#665c54]">{c.email}</span>
											</li>
										))}
									</ul>
								)}
								{selectedCustomer && (
									<p className="text-[#b8bb26] font-mono text-xs mt-1">
										Balance: ${parseFloat(selectedCustomer.store_credit_balance).toFixed(2)}
									</p>
								)}
							</div>

							{/* Pay with credit toggle */}
							{selectedCustomer && parseFloat(detail.event.entry_fee) > 0 && (
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={payWithCredit}
										onChange={(e) => setPayWithCredit(e.target.checked)}
										className="accent-[#fabd2f]"
									/>
									<span className="text-[#a89984] font-mono text-sm">
										Pay ${parseFloat(detail.event.entry_fee).toFixed(2)} with store credit
									</span>
								</label>
							)}

							{registerError && (
								<p className="text-[#fb4934] font-mono text-xs">{registerError}</p>
							)}

							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={() => setRegisterOpen(false)}
									className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2]"
								>
									Cancel
								</button>
								<button
									onClick={handleRegister}
									disabled={registerSaving || !selectedCustomer}
									className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
								>
									{registerSaving ? "Registering…" : "Register"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
