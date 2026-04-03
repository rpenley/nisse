type HeadersWithGetSetCookie = Headers & {
	getSetCookie?: () => string[];
};

export function readSetCookieHeaders(headers: Headers): string[] {
	const getSetCookie = (headers as HeadersWithGetSetCookie).getSetCookie;
	if (typeof getSetCookie === "function") {
		return getSetCookie.call(headers);
	}

	const setCookie = headers.get("set-cookie");
	return setCookie ? [setCookie] : [];
}

export function extractSessionToken(setCookieHeaders: string[]): string | null {
	for (const header of setCookieHeaders) {
		for (const part of header.split(/,(?=\s*[^;,=\s]+=)/)) {
			const match = part.trim().match(/^session=([^;]+)/);
			if (match) {
				return match[1];
			}
		}
	}

	return null;
}
