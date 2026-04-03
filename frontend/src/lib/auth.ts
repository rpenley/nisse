import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export interface AuthUser {
	id: string;
	username: string;
	role: string;
	theme_preference: "light" | "dark";
}

export async function getCurrentUser(): Promise<AuthUser | null> {
	const cookieStore = await cookies();
	const session = cookieStore.get("session")?.value;

	if (!session) {
		return null;
	}

	try {
		const response = await fetch(`${BACKEND_URL}/api/me`, {
			headers: {
				Cookie: `session=${session}`,
			},
			cache: "no-store",
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as AuthUser;
	} catch {
		return null;
	}
}

export async function requireCurrentUser(): Promise<AuthUser> {
	const user = await getCurrentUser();

	if (!user) {
		redirect("/login");
	}

	return user;
}

export async function redirectIfAuthenticated(): Promise<void> {
	const user = await getCurrentUser();

	if (user) {
		redirect("/dashboard");
	}
}
