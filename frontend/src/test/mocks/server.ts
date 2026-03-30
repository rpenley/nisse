import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** MSW Node.js server for use in Vitest (runs in jsdom environment). */
export const server = setupServer(...handlers);
