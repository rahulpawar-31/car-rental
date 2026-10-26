// Validates (and normalises) req.body / req.query / req.params against zod schemas before the
// controller runs. Parsed values replace the originals, so unknown keys are stripped and
// coerced fields (e.g. ?page=2) arrive as the right type. Operators like { $ne: null } can't
// reach a Mongoose query where the schema says "string".
//
// req.query is a read-only getter on Express 5, so parsed values are installed with
// defineProperty, which works on both 4 and 5.
//
//   router.post("/", validate({ body: createBookingBody }), createBooking);
export const validate = (schemas) => (req, res, next) => {
  const errors = [];

  for (const part of ["params", "query", "body"]) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
      continue;
    }
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || part;
      // Zod's default texts ("Invalid input: expected string, received number") never name the
      // field, and the client shows only this message, so add the name when the text lacks it.
      const name = String(issue.path.at(-1) ?? part);
      const message = issue.message.includes(name) ? issue.message : `${name}: ${issue.message}`;
      errors.push({ field, message });
    }
  }

  if (errors.length) {
    // `message` carries the first problem because the web client shows only that field.
    return res.status(400).json({ success: false, message: errors[0].message, errors });
  }
  next();
};
