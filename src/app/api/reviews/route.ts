import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InputError, isAdmin, parseReview } from "@/lib/admin-input";

/** Visible reviews for the home page; admins get all of them. */
export async function GET() {
  const admin = await isAdmin();
  const reviews = await prisma.review.findMany({
    where: admin ? {} : { visible: true },
    orderBy: { reviewDate: "desc" },
  });
  return NextResponse.json(reviews);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const review = await prisma.review.create({ data: parseReview(await req.json()) });
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
