import { describe, expect, it } from "vitest";

import { extractSessionToken } from "@/lib/auth-cookies";

describe("extractSessionToken", () => {
	it("reads a plain session cookie", () => {
		expect(
			extractSessionToken([
				"session=abc123; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400",
			]),
		).toBe("abc123");
	});

	it("finds the session cookie alongside other cookies", () => {
		expect(
			extractSessionToken([
				"theme=light; Path=/, session=xyz789; HttpOnly; Path=/",
			]),
		).toBe("xyz789");
	});

	it("returns null when no session cookie is present", () => {
		expect(extractSessionToken(["theme=light; Path=/"])).toBeNull();
	});
});
