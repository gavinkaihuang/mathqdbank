import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8001";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const url = `${BACKEND}/api/v1/prompts${search ? `?${search}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({ detail: "Invalid backend response" }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Cannot connect to backend" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/api/v1/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ detail: "Invalid backend response" }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Cannot connect to backend" }, { status: 502 });
  }
}
