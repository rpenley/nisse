import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
	const body = await request.json();

	const backendResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const data = await backendResponse.json();

	if (!backendResponse.ok) {
		return NextResponse.json(data, { status: backendResponse.status });
	}

	// Extract the session token from the backend's Set-Cookie header and re-set
	// it explicitly so Next.js owns the cookie rather than relying on the rewrite
	// to forward it (unreliable with Turbopack in dev).
	const setCookieHeader = backendResponse.headers.get("set-cookie");
	const token = setCookieHeader?.match(/^session=([^;]+)/)?.[1];

	const response = NextResponse.json(data, { status: 200 });
	if (token) {
		response.cookies.set("session", token, {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			maxAge: 86400,
		});
	}
	return response;
}
