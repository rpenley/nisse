"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "admin" | "cashier";

interface UserRow {
	id: string;
	username: string;
	role: Role;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
	const [users, setUsers] = useState<UserRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);

	// Modal state (shared for create + edit)
	const [modalOpen, setModalOpen] = useState(false);
	const [editUser, setEditUser] = useState<UserRow | null>(null);
	const [formUsername, setFormUsername] = useState("");
	const [formPassword, setFormPassword] = useState("");
	const [formRole, setFormRole] = useState<Role>("cashier");
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	// ── Fetch ─────────────────────────────────────────────────────────────────

	async function fetchUsers() {
		try {
			const [usersRes, meRes] = await Promise.all([
				fetch("/api/users", { credentials: "include" }),
				fetch("/api/me", { credentials: "include" }),
			]);
			if (!usersRes.ok) throw new Error(usersRes.status === 400 ? "Admin only" : "Failed");
			const [usersData, meData] = await Promise.all([usersRes.json(), meRes.json()]);
			setUsers(usersData);
			setCurrentUserId(meData.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not load users");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchUsers();
	}, []);

	// ── Modal helpers ─────────────────────────────────────────────────────────

	function openCreate() {
		setEditUser(null);
		setFormUsername("");
		setFormPassword("");
		setFormRole("cashier");
		setFormError(null);
		setModalOpen(true);
	}

	function openEdit(user: UserRow) {
		setEditUser(user);
		setFormUsername(user.username);
		setFormPassword("");
		setFormRole(user.role);
		setFormError(null);
		setModalOpen(true);
	}

	function closeModal() {
		setModalOpen(false);
		setEditUser(null);
	}

	// ── Save (create or update) ───────────────────────────────────────────────

	async function handleSave() {
		setSaving(true);
		setFormError(null);
		try {
			let res: Response;
			if (editUser) {
				const body: Record<string, string> = {};
				if (formUsername.trim() && formUsername !== editUser.username) body.username = formUsername.trim();
				if (formPassword.trim()) body.password = formPassword.trim();
				if (formRole !== editUser.role) body.role = formRole;
				if (Object.keys(body).length === 0) { closeModal(); return; }
				res = await fetch(`/api/users/${editUser.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify(body),
				});
			} else {
				if (!formUsername.trim() || !formPassword.trim()) {
					setFormError("Username and password are required");
					return;
				}
				res = await fetch("/api/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ username: formUsername.trim(), password: formPassword.trim(), role: formRole }),
				});
			}

			const data = await res.json();
			if (res.ok) {
				closeModal();
				if (editUser) {
					setUsers((prev) => prev.map((u) => (u.id === editUser.id ? data : u)));
				} else {
					setUsers((prev) => [...prev, data]);
				}
			} else {
				setFormError(data.error ?? "Save failed");
			}
		} catch {
			setFormError("Could not reach server");
		} finally {
			setSaving(false);
		}
	}

	// ── Delete ────────────────────────────────────────────────────────────────

	async function handleDelete(user: UserRow) {
		if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
		const res = await fetch(`/api/users/${user.id}`, {
			method: "DELETE",
			credentials: "include",
		});
		if (res.ok) {
			setUsers((prev) => prev.filter((u) => u.id !== user.id));
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────

	if (loading) return <p className="text-zinc-400 text-sm animate-pulse">Loading…</p>;
	if (error) return <p className="text-rose-600 text-sm">{error}</p>;

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-zinc-900 text-2xl font-bold">Users</h1>
				<button
					onClick={openCreate}
					className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200"
				>
					+ New User
				</button>
			</div>

			<div className="bg-white rounded-xl shadow-sm overflow-hidden">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-zinc-100">
							<th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">Username</th>
							<th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">Role</th>
							<th className="px-4 py-3" />
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
								<td className="px-4 py-3 text-zinc-900">
									{user.username}
									{user.id === currentUserId && (
										<span className="ml-2 text-zinc-400 text-xs">(you)</span>
									)}
								</td>
								<td className="px-4 py-3">
									<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
										user.role === "admin"
											? "bg-amber-50 text-amber-700"
											: "bg-blue-50 text-blue-700"
									}`}>
										{user.role.toUpperCase()}
									</span>
								</td>
								<td className="px-4 py-3">
									<div className="flex gap-3 justify-end">
										<button
											onClick={() => openEdit(user)}
											className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors"
										>
											Edit
										</button>
										{user.id !== currentUserId && (
											<button
												onClick={() => handleDelete(user)}
												className="text-rose-500 hover:text-rose-700 text-xs font-medium transition-colors"
											>
												Delete
											</button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Create / Edit modal */}
			{modalOpen && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
					onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
				>
					<div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
							<h2 className="text-zinc-900 font-semibold">
								{editUser ? "Edit User" : "New User"}
							</h2>
							<button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600 transition-colors">✕</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							{/* Username */}
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									Username
								</label>
								<input
									type="text"
									value={formUsername}
									onChange={(e) => setFormUsername(e.target.value)}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								/>
							</div>

							{/* Password */}
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									{editUser ? "New Password (blank = keep current)" : "Password"}
								</label>
								<input
									type="password"
									value={formPassword}
									onChange={(e) => setFormPassword(e.target.value)}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								/>
							</div>

							{/* Role */}
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									Role
								</label>
								<select
									value={formRole}
									onChange={(e) => setFormRole(e.target.value as Role)}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								>
									<option value="cashier">Cashier</option>
									<option value="admin">Admin</option>
								</select>
							</div>

							{formError && (
								<p className="text-rose-600 text-xs">{formError}</p>
							)}

							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={closeModal}
									className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={handleSave}
									disabled={saving}
									className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
								>
									{saving ? "Saving…" : editUser ? "Save" : "Create"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
