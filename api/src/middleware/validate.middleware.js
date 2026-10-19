// Validates (and normalises) req.body / req.query / req.params against zod schemas before the
// controller runs. Parsed values replace the originals, so unknown keys are stripped and
// coerced fields (e.g. ?page=2) arrive as the right type. Operators like { $ne: null } can't
// reach a Mongoose query where the schema says "string".
//
//   router.post("/", validate({ body: createBookingBody }), createBooking);
export const validate = (schemas) => (req, res, next) => {
  const errors = [];

  for (const part of ["params", "query", "body"]) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      req[part] = result.data;
      continue;
    }
    for (const issue of result.error.issues) {
      errors.push({ field: issue.path.join(".") || part, message: issue.message });
    }
  }

  if (errors.length) {
    // `message` carries the first problem because the web client shows only that field.
    return res.status(400).json({ success: false, message: errors[0].message, errors });
  }
  next();
};
