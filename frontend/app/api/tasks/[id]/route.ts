import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND}/api/v1/tasks/${id}`, { cache: "no-store" });
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.text();
    const res = await fetch(`${BACKEND}/api/v1/tasks/${id}`, {
      method: "PUT",
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND}/api/v1/tasks/${id}`, {
      method: "DELETE",
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
