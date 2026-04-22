import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { contactsRouter } from "./routes/contacts.js";
import { dealsRouter } from "./routes/deals.js";
import { activitiesRouter } from "./routes/activities.js";
import { meetingsRouter } from "./routes/meetings.js";
import { actionsRouter } from "./routes/actions.js";
import { emailsRouter } from "./routes/emails.js";
import { briefingRouter } from "./routes/briefing.js";
import { proposalsRouter } from "./routes/proposals.js";
import { productsRouter } from "./routes/products.js";
import { quotationsRouter } from "./routes/quotations.js";
import { healthRouter } from "./routes/health.js";
import { reportsRouter } from "./routes/reports.js";
import { winlossRouter } from "./routes/winloss.js";
import { competitorsRouter } from "./routes/competitors.js";
import { marketRouter } from "./routes/market.js";
import { rfpRouter } from "./routes/rfp.js";
import { chatRouter } from "./routes/chat.js";
import { searchRouter } from "./routes/search.js";
import { usersRouter } from "./routes/users.js";
import { auditRouter } from "./routes/audit.js";
import { importRouter } from "./routes/import.js";
import { sysHealthRouter } from "./routes/sys-health.js";
import { authMiddleware } from "./middleware/auth.js";
import { requestContext } from "./middleware/request-context.js";
import { log } from "./lib/logger.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "5mb" }));

// Request context runs first so every downstream log line inherits the
// request ID. It also attaches the X-Request-Id response header.
app.use(requestContext);

// System health — unauthenticated so uptime checks can hit it without a token.
app.use("/api/health", sysHealthRouter);

app.use("/api/auth", authRouter);

// Protected routes
app.use("/api/accounts", authMiddleware, accountsRouter);
app.use("/api/contacts", authMiddleware, contactsRouter);
app.use("/api/deals", authMiddleware, dealsRouter);
app.use("/api/activities", authMiddleware, activitiesRouter);
app.use("/api/meetings", authMiddleware, meetingsRouter);
app.use("/api/actions", authMiddleware, actionsRouter);
app.use("/api/emails", authMiddleware, emailsRouter);
app.use("/api/briefing", authMiddleware, briefingRouter);
app.use("/api/proposals", authMiddleware, proposalsRouter);
app.use("/api/products", authMiddleware, productsRouter);
app.use("/api/quotations", authMiddleware, quotationsRouter);
app.use("/api/health-dashboard", authMiddleware, healthRouter);
app.use("/api/reports", authMiddleware, reportsRouter);
app.use("/api/win-loss", authMiddleware, winlossRouter);
app.use("/api/competitors", authMiddleware, competitorsRouter);
app.use("/api/market", authMiddleware, marketRouter);
app.use("/api/rfp", authMiddleware, rfpRouter);
app.use("/api/chat", authMiddleware, chatRouter);
app.use("/api/search", authMiddleware, searchRouter);
app.use("/api/users", authMiddleware, usersRouter);
app.use("/api/audit", authMiddleware, auditRouter);
app.use("/api/import", authMiddleware, importRouter);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  log.info("server.started", { port, env: process.env.NODE_ENV ?? "development" });
});
