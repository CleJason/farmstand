import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { upcomingStandHours } from "@/lib/stand-hours";

export const dynamic = "force-dynamic";

/** Porch Pickup open hours still to come (shown on the walk-up and home pages). */
export async function GET() {
  const hours = await upcomingStandHours();
  return NextResponse.json(hours.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })));
}

function parseHours(data: { startsAt?: unknown; endsAt?: unknown }) {
  const startsAt = new Date(String(data.startsAt ?? ""));
  const endsAt = new Date(String(data.endsAt ?? ""));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return { error: "Pick a day and times" };
  if (endsAt <= startsAt) return { error: "The closing time must be after the opening time" };
  if (endsAt <= new Date()) return { error: "Those hours are already over" };
  return { startsAt, endsAt };
}

/** Add open hours. Admin only. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = parseHours(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json(await prisma.standHours.create({ data: parsed }));
}

/** Change open hours (`id`, `startsAt`, `endsAt`). Admin only. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const parsed = parseHours(data);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { count } = await prisma.standHours.updateMany({ where: { id: String(data.id ?? "") }, data: parsed });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Remove open hours (?id=). Admin only. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await prisma.standHours.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
