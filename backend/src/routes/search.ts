import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";

export const searchRouter = Router();

/**
 * GET /api/search?q=... — cross-entity search for the Shell header.
 *
 * Hits accounts, deals, meetings, proposals, quotations, competitors, RFPs
 * in parallel (Promise.all). Each bucket caps at 5 results. Results are
 * filtered to the current user where ownership applies (meetings, proposals,
 * quotations, competitors, RFPs) — accounts + deals are visible to all.
 */
export type SearchHit = {
  type: "account" | "deal" | "meeting" | "proposal" | "quotation" | "competitor" | "rfp";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
};

searchRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      return ok(res, { hits: [] as SearchHit[], query: q });
    }
    const userId = req.userId;
    const ci = { contains: q, mode: "insensitive" as const };
    const take = 5;

    const [accounts, deals, meetings, proposals, quotations, competitors, rfps] =
      await Promise.all([
        prisma.account.findMany({
          where: { OR: [{ companyName: ci }, { industry: ci }, { notes: ci }] },
          select: { id: true, companyName: true, industry: true },
          orderBy: { updatedAt: "desc" },
          take,
        }),
        prisma.deal.findMany({
          where: { OR: [{ title: ci }, { vendor: ci }, { productLine: ci }] },
          select: {
            id: true,
            title: true,
            vendor: true,
            stage: true,
            accountId: true,
            account: { select: { companyName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take,
        }),
        prisma.meeting.findMany({
          where: { ownerId: userId, OR: [{ title: ci }, { attendees: ci }, { rawNotes: ci }] },
          select: { id: true, title: true, date: true },
          orderBy: { date: "desc" },
          take,
        }),
        prisma.proposal.findMany({
          where: { ownerId: userId, title: ci },
          select: { id: true, title: true, status: true },
          orderBy: { updatedAt: "desc" },
          take,
        }),
        prisma.quotation.findMany({
          where: { ownerId: userId, OR: [{ title: ci }, { number: ci }] },
          select: { id: true, number: true, title: true, status: true },
          orderBy: { updatedAt: "desc" },
          take,
        }),
        prisma.competitor.findMany({
          where: { ownerId: userId, OR: [{ name: ci }, { vendor: ci }, { notes: ci }] },
          select: { id: true, name: true, vendor: true },
          orderBy: { updatedAt: "desc" },
          take,
        }),
        prisma.rFPResponse.findMany({
          where: { userId, OR: [{ title: ci }, { clientName: ci }] },
          select: { id: true, title: true, clientName: true, status: true },
          orderBy: { updatedAt: "desc" },
          take,
        }),
      ]);

    const hits: SearchHit[] = [
      ...accounts.map((a) => ({
        type: "account" as const,
        id: a.id,
        title: a.companyName,
        subtitle: a.industry ?? undefined,
        url: `/crm/${a.id}`,
      })),
      ...deals.map((d) => ({
        type: "deal" as const,
        id: d.id,
        title: d.title,
        subtitle: [d.account?.companyName, d.stage, d.vendor].filter(Boolean).join(" · "),
        // Deals don't have a standalone detail page — open the parent account.
        url: `/crm/${d.accountId}`,
      })),
      ...meetings.map((m) => ({
        type: "meeting" as const,
        id: m.id,
        title: m.title,
        subtitle: new Date(m.date).toLocaleDateString("vi-VN"),
        url: `/meetings/${m.id}`,
      })),
      ...proposals.map((p) => ({
        type: "proposal" as const,
        id: p.id,
        title: p.title,
        subtitle: p.status,
        url: `/proposals/${p.id}`,
      })),
      ...quotations.map((q) => ({
        type: "quotation" as const,
        id: q.id,
        title: `${q.number} — ${q.title}`,
        subtitle: q.status,
        url: `/quotations/${q.id}`,
      })),
      ...competitors.map((c) => ({
        type: "competitor" as const,
        id: c.id,
        title: c.name,
        subtitle: c.vendor ?? undefined,
        url: `/competitors/${c.id}`,
      })),
      ...rfps.map((r) => ({
        type: "rfp" as const,
        id: r.id,
        title: r.title,
        subtitle: [r.clientName, r.status].filter(Boolean).join(" · "),
        url: `/rfp/${r.id}`,
      })),
    ];

    ok(res, { hits, query: q });
  } catch (e) {
    next(e);
  }
});
