import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { parseCsv } from "@/lib/csv";
import { readXlsx, unzip, type Sheet } from "@/lib/xlsx-read";
import { planFromMealie, planFromWorkbook } from "@/lib/costs-import";
import { match } from "@/lib/costs-import-match";

/**
 * Reads an import file for the Android app (the website reads it in the browser):
 * a cost spreadsheet (.xlsx or .csv tabs) or Mealie recipes (.json, .zip, or
 * pasted JSON in `mealie`). Saves nothing: the app shows what was found, then
 * sends the plan to /api/costs/import.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "No file" }, { status: 400 });
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  const pasted = String(form.get("mealie") ?? "").trim();
  try {
    const isMealie = !!pasted || (files.length > 0 && files.every((f) => /\.(json|zip)$/i.test(f.name)));
    if (isMealie) {
      const jsons: unknown[] = [];
      if (pasted) jsons.push(JSON.parse(pasted));
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          for (const [path, bytes] of await unzip(await f.arrayBuffer())) {
            if (path.endsWith(".json")) jsons.push(JSON.parse(new TextDecoder().decode(bytes)));
          }
        } else jsons.push(JSON.parse(await f.text()));
      }
      const plan = planFromMealie(jsons);
      if (!plan.recipes.length) return NextResponse.json({ error: "Couldn't find any Mealie recipes in that." }, { status: 400 });
      const ingredients = await prisma.ingredient.findMany({ select: { id: true, name: true } });
      const picks = plan.recipes.map((r) => r.lines.map((l) => match(l.ingredientName, ingredients)));
      return NextResponse.json({ kind: "mealie", plan, picks });
    }
    const sheets: Sheet[] = [];
    for (const f of files) {
      if (/\.xlsx$/i.test(f.name)) sheets.push(...(await readXlsx(f)));
      else sheets.push({ name: f.name.replace(/\.csv$/i, "").replace(/^.* - /, ""), rows: parseCsv(await f.text()) });
    }
    const plan = planFromWorkbook(sheets);
    if (!plan.purchases.length && !plan.recipes.length && !plan.ingredients.length && !plan.receipts?.length && !plan.pastSales?.length) {
      return NextResponse.json({ error: "Couldn't find a purchase log, receipts, orders or recipe tabs in that file." }, { status: 400 });
    }
    return NextResponse.json({ kind: "sheet", plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that file" }, { status: 400 });
  }
}
