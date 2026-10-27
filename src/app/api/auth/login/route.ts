import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { twitchClientId, twitchRedirectUri } from "@/lib/twitch/auth";

export const runtime = "nodejs";

export function GET() {
  try {
    const redirectUri = twitchRedirectUri();
    const state = randomBytes(32).toString("hex");
    const authorizeUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: twitchClientId(),
      redirect_uri: redirectUri,
      scope: "user:read:chat user:write:chat user:bot clips:edit",
      state,
    }).toString();

    const response = NextResponse.redirect(authorizeUrl);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set("twitch_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(redirectUri).protocol === "https:",
      path: "/api/auth",
      maxAge: 600,
    });
    return response;
  } catch {
    return new NextResponse("Twitch login is not configured", { status: 500 });
  }
}
