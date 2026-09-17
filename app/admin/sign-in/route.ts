import { NextRequest, NextResponse } from "next/server"
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url))
  response.cookies.set("forma-admin-continuation", "1", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 600 })
  return response
}
