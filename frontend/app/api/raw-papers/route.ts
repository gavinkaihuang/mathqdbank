import { NextResponse } from "next/server";

const backendBaseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET() {
  try {
    const response = await fetch(`${backendBaseUrl}/api/v1/raw-papers`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({ detail: "Invalid backend response" }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "Cannot connect to backend service" },
      { status: 502 },
    );
  }
}
