import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const backendBaseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await req.json();
    const response = await fetch(`${backendBaseUrl}/api/v1/raw-papers/${id}/recrop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
