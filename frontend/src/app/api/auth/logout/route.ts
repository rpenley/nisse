import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function POST() {
	const cookieStore = await cookies();
	const session = cookieStore.get("session")?.value;

	if (session) {
		try {
			await fetch(`${BACKEND_URL}/api/auth/logout`, {
				method: "POST",
				headers: {
					Cookie: `session=${session}`,
				},
				cache: "no-store",
			});
		} catch {
			// Clearing the frontend-owned cookie is enough to sign out locally.
		}
	}

	const response = NextResponse.json({ message: "Logged out" });
	response.cookies.set("session", "", {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	return response;
}
