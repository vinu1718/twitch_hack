import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, twitchRedirectUri } from "@/lib/twitch/auth";
import { startEventSub } from "@/lib/twitch/eventsub";

export const runtime = "nodejs";

function clearState(response: NextResponse): NextResponse {
  response.cookies.set("twitch_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: twitchRedirectUri().startsWith("https:"),
    path: "/api/auth",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const expected = request.cookies.get("twitch_oauth_state")?.value;
  const received = request.nextUrl.searchParams.get("state");
  const validState =
    expected &&
    received &&
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));

  if (!validState) {
    return clearState(new NextResponse("Invalid or expired Twitch login state", { status: 400 }));
  }
  if (request.nextUrl.searchParams.has("error")) {
    return clearState(new NextResponse("Twitch authorization was declined", { status: 400 }));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return clearState(new NextResponse("Missing Twitch authorization code", { status: 400 }));

  try {
    await exchangeCode(code);
    await startEventSub();
    return clearState(NextResponse.redirect(new URL("/dashboard", twitchRedirectUri()), 303));
  } catch {
    console.error("Twitch login failed");
    return clearState(new NextResponse("Twitch login failed; please try again", { status: 502 }));
  }
}
