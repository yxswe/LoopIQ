/**
 * Tiny API client — only `pingHealth()` for now.
 *
 * The backend exposes GET /health which returns `{ status: string; uptime: number }`.
 * We surface fetch / non-2xx failures as thrown Errors with friendly messages
 * so the UI can render them as assistant bubbles.
 */

export type HealthResponse = {
  status: string;
  uptime: number;
};

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:3000";

export const getBackendUrl = (): string => BACKEND_URL;

export const pingHealth = async (): Promise<HealthResponse> => {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    throw new Error(`Backend unreachable at ${BACKEND_URL} (${reason})`);
  }

  if (!response.ok) {
    throw new Error(
      `Backend returned ${response.status} ${response.statusText} from ${BACKEND_URL}/health`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Backend response was not valid JSON");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as HealthResponse).status !== "string" ||
    typeof (body as HealthResponse).uptime !== "number"
  ) {
    throw new Error("Backend response did not match { status, uptime }");
  }

  return body as HealthResponse;
};
