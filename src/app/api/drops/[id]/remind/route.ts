import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { remindDrop } from "@/lib/drop-reminders";
import { clock, isTextingTime, textHours } from "@/lib/text-hours";

/** Admin → Drops → "Send reminder now": the closing-soon reminder, right away (once per drop). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const drop = await prisma.drop.findUnique({ where: { id } });
  if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  if (drop.reminderSentAt) return NextResponse.json({ error: "The reminder for this drop was already sent" }, { status: 400 });
  const now = new Date();
  if (drop.status !== "OPEN" || drop.orderOpenAt > now || drop.orderCloseAt <= now) {
    return NextResponse.json({ error: "Reminders can only go out while ordering is open" }, { status: 400 });
  }

  const hours = await textHours();
  if (!(await isTextingTime(now, hours))) {
    return NextResponse.json(
      { error: `It's outside texting hours (${clock(hours.start)}–${clock(hours.end)}). Send it then, or let it go automatically.` },
      { status: 400 }
    );
  }

  const result = await remindDrop(id, { now: true });
  if (!result.sent) {
    return NextResponse.json({ error: "Couldn't send it. Check that n8n is running and the workflow is published." }, { status: 400 });
  }
  return NextResponse.json(result);
}
