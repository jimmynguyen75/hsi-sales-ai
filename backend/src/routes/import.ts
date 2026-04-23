/**
 * Bulk CSV import endpoints.
 *
 * Two targets so far: accounts (any role can import own accounts) and
 * products (admin only — product catalog is shared).
 *
 * Flow: client uploads a CSV → `dryRun=true` returns a BulkReport with
 * validation errors and a preview; client confirms → `dryRun=false` writes
 * to the DB. The dry-run/commit separation is important because import
 * errors surface up-front rather than after half the rows have been written.
 */
import { Router } from "express";
import multer from "multer";
import { fail, ok } from "../lib/response.js";
import { requireRole } from "../middleware/rbac.js";
import { logAudit } from "../services/audit.js";
import {
  parseCsv,
  importAccounts,
  importProducts,
} from "../services/csv-import.js";

export const importRouter = Router();

// 5 MB is plenty for CSV with tens of thousands of rows.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseCommonFields(req: Express.Request & { file?: Express.Multer.File; body: Record<string, unknown> }) {
  const file = req.file;
  if (!file) throw new Error("Thiếu file upload (field 'file')");
  const text = file.buffer.toString("utf8");
  const rows = parseCsv(text);
  const dryRun = String(req.body.dryRun ?? "true") !== "false";
  return { rows, dryRun, filename: file.originalname };
}

importRouter.post("/accounts", upload.single("file"), async (req, res, next) => {
  try {
    const { rows, dryRun, filename } = parseCommonFields(req);
    if (rows.length === 0) return fail(res, 400, "CSV rỗng hoặc không đọc được.");
    const report = await importAccounts(rows, req.userId, dryRun);
    if (!dryRun && (report.created + report.updated) > 0) {
      await logAudit(req, {
        action: "create",
        entity: "account",
        summary: `Bulk import accounts từ "${filename}": +${report.created} / cập nhật ${report.updated} / lỗi ${report.errors.length}`,
      });
    }
    ok(res, report);
  } catch (e) {
    next(e);
  }
});

importRouter.post(
  "/products",
  requireRole("admin"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const { rows, dryRun, filename } = parseCommonFields(req);
      if (rows.length === 0) return fail(res, 400, "CSV rỗng hoặc không đọc được.");
      const report = await importProducts(rows, dryRun);
      if (!dryRun && (report.created + report.updated) > 0) {
        await logAudit(req, {
          action: "create",
          entity: "product",
          summary: `Bulk import products từ "${filename}": +${report.created} / cập nhật ${report.updated} / lỗi ${report.errors.length}`,
        });
      }
      ok(res, report);
    } catch (e) {
      next(e);
    }
  },
);

// Sample CSV downloads — make it easy for the user to see the expected columns.
importRouter.get("/sample/accounts.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="accounts-sample.csv"');
  res.send(
    "companyName,industry,size,website,address,notes\n" +
      'Acme Corp,Technology,mid-market,https://acme.com,"123 Nguyễn Huệ, Q1, HCM",Demo note\n' +
      "Beta Inc,Finance,enterprise,https://beta.com,Hanoi,\n",
  );
});

importRouter.get("/sample/products.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="products-sample.csv"');
  res.send(
    "vendor,sku,name,description,category,unit,listPrice,partnerCost,currency\n" +
      "HPE,DL360-G11,HPE ProLiant DL360 Gen11,Rackmount server 1U,server,unit,120000000,90000000,VND\n" +
      'Palo Alto,PA-5450,Palo Alto PA-5450 Firewall,"NGFW, 72Gbps",networking,unit,2500000000,,VND\n',
  );
});
