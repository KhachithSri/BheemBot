import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "Audio recording downloads are disabled" },
    { status: 410 },
  );
}
