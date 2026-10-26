/**
 * The revenue chart's window: the `months` most recent calendar months ending with the one that
 * contains `now`, as month-start Dates in server local time (the same clock the dashboard's
 * "this month" / "last month" figures use, so the chart's current bar agrees with them).
 *
 * @param {Date} [now]
 * @param {number} [months]
 * @returns {Date[]} oldest first
 */
export function revenueMonthStarts(now = new Date(), months = 12) {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a positive integer");
  return Array.from({ length: months }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1));
}

/**
 * Aggregation pipeline for the dashboard's revenue chart: succeeded payments summed per calendar
 * month over the last `months` months, oldest first.
 *
 * Only payments inside the window are read, and months are bucketed on the same local month
 * boundaries as the stat tiles. Buckets that have payments come back as `{ _id: <month start>,
 * total, count }`; pass the result to {@link shapeRevenueByMonth} for the chart's shape.
 *
 * @param {{ now?: Date, months?: number }} [options]
 */
export function revenueByMonthPipeline({ now = new Date(), months = 12 } = {}) {
  const starts = revenueMonthStarts(now, months);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [
    { $match: { status: "succeeded", createdAt: { $gte: starts[0], $lt: end } } },
    {
      $bucket: {
        groupBy: "$createdAt",
        boundaries: [...starts, end],
        output: { total: { $sum: "$amount" }, count: { $sum: 1 } },
      },
    },
  ];
}

/**
 * Turns the pipeline's buckets into the chart's `{ _id: { year, month }, total, count }` rows,
 * oldest first, with a zero row for every month that had no payments. The series starts at the
 * first month with revenue (so a new business doesn't open with a run of empty bars) and runs to
 * the current month, so adjacent bars are always adjacent months.
 *
 * @param {{ _id: Date, total: number, count: number }[]} buckets
 * @param {{ now?: Date, months?: number }} [options]
 */
export function shapeRevenueByMonth(buckets, { now = new Date(), months = 12 } = {}) {
  const byMonth = new Map(buckets.map((b) => [b._id.getFullYear() * 12 + b._id.getMonth(), b]));
  const rows = revenueMonthStarts(now, months).map((start) => {
    const bucket = byMonth.get(start.getFullYear() * 12 + start.getMonth());
    return {
      _id: { year: start.getFullYear(), month: start.getMonth() + 1 },
      total: bucket?.total ?? 0,
      count: bucket?.count ?? 0,
    };
  });
  const first = rows.findIndex((r) => r.count > 0);
  return first === -1 ? [] : rows.slice(first);
}
