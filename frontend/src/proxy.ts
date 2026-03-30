import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/pos", "/inventory", "/customers", "/calendar", "/users", "/roles", "/profile", "/purchase-orders"];
const LOGIN_PATH = "/login";

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	const isProtected = PROTECTED_PATHS.some(
		(path) => pathname === path || pathname.startsWith(path + "/")
	);

	if (!isProtected) {
		return NextResponse.next();
	}

	const sessionToken = request.cookies.get("session")?.value;

	if (!sessionToken) {
		const loginUrl = new URL(LOGIN_PATH, request.url);
		loginUrl.searchParams.set("next", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico).*)",
	],
};
