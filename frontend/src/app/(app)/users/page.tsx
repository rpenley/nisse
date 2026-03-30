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

	if (loading) return <p className="text-[#928374] font-mono text-sm">Loading…</p>;
	if (error) return <p className="text-[#fb4934] font-mono text-sm">{error}</p>;

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-[#fabd2f] font-mono text-2xl font-bold">Users</h1>
				<button
					onClick={openCreate}
					className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
				>
					+ New User
				</button>
			</div>

			<div className="border border-[#3c3836] overflow-x-auto">
				<table className="w-full font-mono text-sm">
					<thead>
						<tr className="border-b border-[#3c3836] text-[#a89984]">
							<th className="text-left px-4 py-2 font-normal text-xs uppercase tracking-wider">Username</th>
							<th className="text-left px-4 py-2 font-normal text-xs uppercase tracking-wider">Role</th>
							<th className="px-4 py-2" />
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user.id} className="border-b border-[#3c3836] hover:bg-[#3c3836] transition-colors">
								<td className="px-4 py-3 text-[#ebdbb2]">
									{user.username}
									{user.id === currentUserId && (
										<span className="ml-2 text-[#928374] text-xs">(you)</span>
									)}
								</td>
								<td className="px-4 py-3">
									<span className={`font-mono text-xs px-1.5 py-0.5 border ${
										user.role === "admin"
											? "border-[#fabd2f] text-[#fabd2f]"
											: "border-[#83a598] text-[#83a598]"
									}`}>
										{user.role.toUpperCase()}
									</span>
								</td>
								<td className="px-4 py-3">
									<div className="flex gap-3 justify-end">
										<button
											onClick={() => openEdit(user)}
											className="text-[#83a598] hover:text-[#ebdbb2] transition-colors text-xs"
										>
											Edit
										</button>
										{user.id !== currentUserId && (
											<button
												onClick={() => handleDelete(user)}
												className="text-[#fb4934] hover:text-[#ebdbb2] transition-colors text-xs"
											>
												Del
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
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">
								{editUser ? "Edit User" : "New User"}
							</h2>
							<button onClick={closeModal} className="text-[#928374] hover:text-[#ebdbb2] font-mono">✕</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							{/* Username */}
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Username
								</label>
								<input
									type="text"
									value={formUsername}
									onChange={(e) => setFormUsername(e.target.value)}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
								/>
							</div>

							{/* Password */}
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									{editUser ? "New Password (blank = keep current)" : "Password"}
								</label>
								<input
									type="password"
									value={formPassword}
									onChange={(e) => setFormPassword(e.target.value)}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
								/>
							</div>

							{/* Role */}
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Role
								</label>
								<select
									value={formRole}
									onChange={(e) => setFormRole(e.target.value as Role)}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
								>
									<option value="cashier">Cashier</option>
									<option value="admin">Admin</option>
								</select>
							</div>

							{formError && (
								<p className="text-[#fb4934] font-mono text-xs">{formError}</p>
							)}

							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={closeModal}
									className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2]"
								>
									Cancel
								</button>
								<button
									onClick={handleSave}
									disabled={saving}
									className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
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
