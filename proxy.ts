import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "./app/lib/cross-site";

export function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request.method, request.headers.get("origin"), request.nextUrl.host)) {
    return NextResponse.json({ error: "Cross-site requests are not accepted" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
