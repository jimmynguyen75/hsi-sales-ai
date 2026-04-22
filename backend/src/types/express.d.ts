// Augments Express's Request with fields set by authMiddleware.
// Declared as non-optional because every route that reads them is wrapped
// by authMiddleware at mount time — runtime always populates them before
// the handler runs. Public routes (login/register) simply don't read these.
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userRole: string;
    }
  }
}

export {};
