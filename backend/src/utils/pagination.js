const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 200;

/** Lee page/limit del query string y devuelve limit/offset saneados. */
function getPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Da formato uniforme a las respuestas paginadas. */
function buildPage({ rows, count }, { page, limit }) {
  return {
    data: rows,
    meta: {
      total: count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    },
  };
}

module.exports = { getPagination, buildPage, DEFAULT_LIMIT, MAX_LIMIT };
