import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/tasks/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const raw = await res.text();
    const data = raw
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return { detail: raw };
          }
        })()
      : { detail: "Empty backend response" };

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Cannot connect to backend" }, { status: 502 });
  }
}
