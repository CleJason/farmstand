import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [packageId, fingerprint] = await Promise.all([
    getSetting("ANDROID_PACKAGE_ID"),
    getSetting("ANDROID_CERT_SHA256"),
  ]);
  return NextResponse.json({ packageId, fingerprint });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId = "", fingerprint = "" } = await req.json();
  const pkg = String(packageId).trim();
  const fp = String(fingerprint).trim().toUpperCase();
  if (pkg && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg)) {
    return NextResponse.json({ error: "Package should look like com.example.shop.admin" }, { status: 400 });
  }
  if (fp && !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp)) {
    return NextResponse.json(
      { error: "Fingerprint should be 32 pairs like AB:CD:… (copy it from the build summary)" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: "ANDROID_PACKAGE_ID" },
      update: { value: pkg },
      create: { key: "ANDROID_PACKAGE_ID", value: pkg },
    }),
    prisma.setting.upsert({
      where: { key: "ANDROID_CERT_SHA256" },
      update: { value: fp },
      create: { key: "ANDROID_CERT_SHA256", value: fp },
    }),
  ]);
  return NextResponse.json({ packageId: pkg, fingerprint: fp });
}
