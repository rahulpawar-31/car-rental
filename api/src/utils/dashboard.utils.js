/**
 * Aggregation pipeline for the dashboard's revenue chart: succeeded payments summed per calendar
 * month, for the most recent `months` months that have any, in chronological order.
 *
 * The first sort is newest-first so that $limit keeps the latest months; sorting oldest-first
 * before $limit would keep the oldest ones, and the chart would stop advancing once there is more
 * than a year of history. The second sort puts the kept months back in chronological order.
 *
 * @param {number} [months]
 */
export function revenueByMonthPipeline(months = 12) {
  return [
    { $match: { status: "succeeded" } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: months },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ];
}
