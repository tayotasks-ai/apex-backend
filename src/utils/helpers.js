// ── ApiError ──────────────────────────────────────────────────────────────────
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── catchAsync ────────────────────────────────────────────────────────────────
const catchAsync = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── respond ───────────────────────────────────────────────────────────────────
const ok = (res, data, message = 'Success', status = 200, extra = null) => {
  if (typeof status === 'object') {
    extra = status;
    status = 200;
  }
  const payload = { success: true, message, data };
  if (extra) Object.assign(payload, extra);
  return res.status(status).json(payload);
};
const created = (res, data, message = 'Created') => ok(res, data, message, 201);
const fail = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });

// ── grade ─────────────────────────────────────────────────────────────────────
const getGrade = pct => {
  if (pct >= 70) return 'A'; if (pct >= 60) return 'B'; if (pct >= 50) return 'C';
  if (pct >= 45) return 'D'; if (pct >= 40) return 'E'; return 'F';
};

// ── pagination ────────────────────────────────────────────────────────────────
const paginate = q => {
  const page  = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(100, parseInt(q.limit) || 20);
  return { page, limit, skip: (page - 1) * limit };
};
const meta = (page, limit, total) => ({
  page, limit, total, pages: Math.ceil(total / limit),
});

module.exports = { ApiError, catchAsync, ok, created, fail, getGrade, paginate, meta };
