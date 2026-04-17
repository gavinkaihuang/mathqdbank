import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string; questionId: string }>;
};

const backendBaseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id, questionId } = await context.params;

  try {
    const response = await fetch(`${backendBaseUrl}/api/v1/raw-papers/${id}/questions/${questionId}`, {
      method: "DELETE",
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
