import { NextResponse } from "next/server";

import { extractSessionToken, readSetCookieHeaders } from "@/lib/auth-cookies";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
	const body = await request.json();

	const backendResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		cache: "no-store",
	});

	const data = await backendResponse.json();

	if (!backendResponse.ok) {
		return NextResponse.json(data, { status: backendResponse.status });
	}

	const token = extractSessionToken(readSetCookieHeaders(backendResponse.headers));

	if (!token) {
		return NextResponse.json(
			{ error: "Login succeeded but no session was issued" },
			{ status: 502 },
		);
	}

	const response = NextResponse.json(data, { status: 200 });
	response.cookies.set("session", token, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 86400,
	});
	return response;
}
