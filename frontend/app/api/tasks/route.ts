import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const url = `${BACKEND}/api/v1/tasks${search ? `?${search}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
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

export async function POST(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const endpoint = search ? `/api/v1/tasks?${search}` : "/api/v1/tasks";

  try {
    const body = await req.text();
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
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
