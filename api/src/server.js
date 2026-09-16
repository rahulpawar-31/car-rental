import "dotenv/config";

import app from "./app.js";
import connectDB from "./config/db.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.PORT || 5000;

await connectDB();

app.listen(PORT, () => {
  logger.info(`DriveEase API running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
