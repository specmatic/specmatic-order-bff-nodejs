function requireJsonContentType(req, res, next) {
  if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
    if (!req.is("application/json")) {
      return res.status(415).json({
        status: 415,
        error: "Unsupported Media Type",
        timestamp: new Date().toISOString(),
        message: "Content-Type application/json required",
      });
    }
  }

  return next();
}

module.exports = requireJsonContentType;
